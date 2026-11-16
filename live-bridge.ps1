# Setup Engineer live bridge
# Reads iRacing's live telemetry (shared memory) and serves it to setup-engineer.html on http://localhost:8766
#   Live:    .\live-bridge.ps1
#   Replay:  .\live-bridge.ps1 -Replay "C:\path\file.ibt" -Speed 10     (plays a recorded file as if live)
param([string]$Replay = "", [double]$Speed = 1, [int]$Port = 8766, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'

$code = @'
using System;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Net;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;

public class IRBridge {
    readonly object lk = new object();
    byte[][] ring; long total = 0; int gen = 0; int bufLen = 0; byte[] meta = null; int siUpdate = -1;
    volatile bool connected = false; string mode = "live"; string replayName = ""; string root;

    public IRBridge(string root, int cap) { this.root = root; ring = new byte[cap][]; }

    void Push(byte[] rec) { lock (lk) { ring[total % ring.Length] = rec; total++; } }
    void NewGen(byte[] m, int bl, int si) { lock (lk) { gen++; total = 0; meta = m; bufLen = bl; siUpdate = si; } }

    static byte[] ReadMeta(MemoryMappedViewAccessor acc) {
        int siLen = acc.ReadInt32(16), siOff = acc.ReadInt32(20), numVars = acc.ReadInt32(24), varOff = acc.ReadInt32(28);
        int end = Math.Max(varOff + numVars * 144, siOff + siLen);
        byte[] m = new byte[end]; acc.ReadArray<byte>(0, m, 0, end); return m;
    }

    public void StartLive() { Thread t = new Thread(LiveLoop); t.IsBackground = true; t.Start(); }

    void LiveLoop() {
        while (true) {
            try {
                using (var mmf = MemoryMappedFile.OpenExisting("Local\\IRSDKMemMapFileName", MemoryMappedFileRights.Read))
                using (var acc = mmf.CreateViewAccessor(0, 0, MemoryMappedFileAccess.Read)) {
                    int lastTick = int.MinValue, lastSi = -1; bool was = false;
                    while (true) {
                        int status = acc.ReadInt32(4);
                        if ((status & 1) == 0) { connected = false; was = false; Thread.Sleep(250); continue; }
                        int si = acc.ReadInt32(12), bl = acc.ReadInt32(36);
                        if (!was) { NewGen(ReadMeta(acc), bl, si); lastSi = si; lastTick = int.MinValue; was = true; }
                        else if (si != lastSi) { byte[] m = ReadMeta(acc); lock (lk) { meta = m; siUpdate = si; } lastSi = si; }
                        connected = true;
                        int numBuf = acc.ReadInt32(32);
                        List<int[]> fresh = new List<int[]>();
                        for (int i = 0; i < numBuf; i++) {
                            int t = acc.ReadInt32(48 + i * 16);
                            if (t > lastTick) fresh.Add(new int[] { t, acc.ReadInt32(52 + i * 16), i });
                        }
                        fresh.Sort((a, b) => a[0].CompareTo(b[0]));
                        foreach (int[] e in fresh) {
                            byte[] rec = new byte[bl];
                            acc.ReadArray<byte>(e[1], rec, 0, bl);
                            if (acc.ReadInt32(48 + e[2] * 16) != e[0]) continue; // overwritten while copying
                            Push(rec); lastTick = e[0];
                        }
                        Thread.Sleep(4);
                    }
                }
            } catch (Exception) { connected = false; Thread.Sleep(1000); }
        }
    }

    public void StartReplay(string file, double speed) {
        mode = "replay"; replayName = Path.GetFileName(file);
        Thread t = new Thread(() => ReplayLoop(file, speed)); t.IsBackground = true; t.Start();
    }

    void ReplayLoop(string file, double speed) {
        byte[] b = File.ReadAllBytes(file);
        int tick = BitConverter.ToInt32(b, 8), siLen = BitConverter.ToInt32(b, 16), siOff = BitConverter.ToInt32(b, 20);
        int numVars = BitConverter.ToInt32(b, 24), varOff = BitConverter.ToInt32(b, 28), bl = BitConverter.ToInt32(b, 36);
        int dataOff = BitConverter.ToInt32(b, 52);
        if (tick <= 0) tick = 60;
        int end = Math.Max(varOff + numVars * 144, siOff + siLen);
        byte[] m = new byte[end]; Buffer.BlockCopy(b, 0, m, 0, end);
        int n = (b.Length - dataOff) / bl;
        NewGen(m, bl, 1); connected = true;
        Stopwatch sw = Stopwatch.StartNew();
        for (int r = 0; r < n; r++) {
            byte[] rec = new byte[bl]; Buffer.BlockCopy(b, dataOff + r * bl, rec, 0, bl); Push(rec);
            double due = r / (tick * speed) * 1000.0;
            while (sw.ElapsedMilliseconds < due) Thread.Sleep(5);
        }
        connected = false;
    }

    public void Serve(int port) {
        HttpListener l = new HttpListener(); l.Prefixes.Add("http://localhost:" + port + "/"); l.Start();
        while (true) { HttpListenerContext ctx = l.GetContext(); ThreadPool.QueueUserWorkItem(Handle, ctx); }
    }

    static void Send(HttpListenerResponse res, byte[] b, string type) {
        res.ContentType = type; res.ContentLength64 = b.Length; res.OutputStream.Write(b, 0, b.Length);
    }

    void Handle(object o) {
        HttpListenerContext ctx = (HttpListenerContext)o; HttpListenerResponse res = ctx.Response;
        try {
            res.AddHeader("Cache-Control", "no-store");
            string p = ctx.Request.Url.AbsolutePath;
            if (p == "/live/status") {
                string js;
                lock (lk) js = "{\"connected\":" + (connected ? "true" : "false") + ",\"gen\":" + gen + ",\"total\":" + total +
                    ",\"siUpdate\":" + siUpdate + ",\"mode\":\"" + mode + "\",\"replay\":\"" + replayName.Replace("\\", "/").Replace("\"", "") + "\"}";
                Send(res, Encoding.UTF8.GetBytes(js), "application/json");
            } else if (p == "/live/meta") {
                byte[] m; int g, si; lock (lk) { m = meta; g = gen; si = siUpdate; }
                res.AddHeader("X-Gen", g.ToString()); res.AddHeader("X-Si", si.ToString());
                if (m == null) res.StatusCode = 404; else Send(res, m, "application/octet-stream");
            } else if (p == "/live/data") {
                long from = 0; long.TryParse(ctx.Request.QueryString["from"], out from);
                byte[] outb; long start, next; int g;
                lock (lk) {
                    g = gen; long lo = Math.Max(0, total - ring.Length);
                    start = Math.Max(from, lo); if (start > total) start = lo;
                    long cnt = Math.Min(total - start, 3600);
                    outb = new byte[cnt * bufLen];
                    for (long i = 0; i < cnt; i++) Buffer.BlockCopy(ring[(start + i) % ring.Length], 0, outb, (int)(i * bufLen), bufLen);
                    next = start + cnt;
                }
                res.AddHeader("X-Gen", g.ToString()); res.AddHeader("X-From", start.ToString()); res.AddHeader("X-Next", next.ToString());
                Send(res, outb, "application/octet-stream");
            } else {
                string name = p.TrimStart('/'); if (name == "") name = "setup-engineer.html";
                string f = Path.Combine(root, name);
                if (name.Contains("..") || name.Contains("/") || !name.EndsWith(".html") || !File.Exists(f)) res.StatusCode = 404;
                else Send(res, File.ReadAllBytes(f), "text/html; charset=utf-8");
            }
        } catch (Exception) { }
        finally { try { res.Close(); } catch (Exception) { } }
    }
}
'@

Add-Type -TypeDefinition $code -Language CSharp -ReferencedAssemblies System.Core
$bridge = New-Object IRBridge -ArgumentList $PSScriptRoot, 72000
if ($Replay) {
  Write-Host "Replaying $Replay at ${Speed}x"
  $bridge.StartReplay((Resolve-Path -LiteralPath $Replay).Path, $Speed)
} else {
  $bridge.StartLive()
  Write-Host "Waiting for iRacing (it connects automatically once you are in a session)."
}
$url = "http://localhost:$Port/"
Write-Host "Setup Engineer live: $url   (close this window to stop)"
if (-not $NoBrowser) { Start-Process $url }
$bridge.Serve($Port)
