// Setup Engineer telemetry bridge.
// Runs in the background (started by the Electron app), reads iRacing's live telemetry from shared memory
// and serves it, plus the app's web pages, on http://localhost:<port>.
// Also plays recorded .ibt files as if live ("demo"), so overlays can be placed without iRacing running.
//   se-bridge.exe --port 8766 --web <dir> [--parent <pid>]
// Prints "PORT <n>" on stdout once listening.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Net;
using System.Text;
using System.Threading;

[assembly: System.Reflection.AssemblyTitle("Setup Engineer bridge")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

public class Bridge {
    readonly object lk = new object();
    byte[][] ring; long total = 0; int gen = 0; int bufLen = 0; byte[] meta = null; int siUpdate = -1;
    volatile bool connected = false; volatile bool demo = false; volatile int demoToken = 0; string demoName = "";
    string webDir, telDir; public string logosDir;

    public Bridge(string webDir, int cap) {
        this.webDir = Path.GetFullPath(webDir); ring = new byte[cap][];
        telDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "iRacing", "telemetry");
    }

    void Push(byte[] rec) { lock (lk) { ring[total % ring.Length] = rec; total++; } }
    void NewGen(byte[] m, int bl, int si) { lock (lk) { gen++; total = 0; meta = m; bufLen = bl; siUpdate = si; } }

    static byte[] ReadMeta(MemoryMappedViewAccessor acc) {
        int siLen = acc.ReadInt32(16), siOff = acc.ReadInt32(20), numVars = acc.ReadInt32(24), varOff = acc.ReadInt32(28);
        int end = Math.Max(varOff + numVars * 144, siOff + siLen);
        byte[] m = new byte[end]; acc.ReadArray<byte>(0, m, 0, end); return m;
    }

    // ---------- live ----------
    public void StartLive() { Thread t = new Thread(LiveLoop); t.IsBackground = true; t.Start(); }

    void LiveLoop() {
        while (true) {
            if (demo) { Thread.Sleep(250); continue; }
            try {
                using (var mmf = MemoryMappedFile.OpenExisting("Local\\IRSDKMemMapFileName", MemoryMappedFileRights.Read))
                using (var acc = mmf.CreateViewAccessor(0, 0, MemoryMappedFileAccess.Read)) {
                    int lastTick = int.MinValue, lastSi = -1; bool was = false;
                    while (!demo) {
                        int status = acc.ReadInt32(4);
                        if ((status & 1) == 0) { if (!demo) connected = false; was = false; Thread.Sleep(250); continue; }
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
                            if (acc.ReadInt32(48 + e[2] * 16) != e[0]) continue;
                            Push(rec); lastTick = e[0];
                        }
                        Thread.Sleep(4);
                    }
                    if (!demo) connected = false;
                }
            } catch (Exception) { if (!demo) connected = false; Thread.Sleep(1000); }
        }
    }

    // ---------- demo (replay a recording in a loop) ----------
    public void StartDemo(string file, double speed) {
        int token = ++demoToken; demo = true; demoName = Path.GetFileName(file);
        Thread t = new Thread(() => DemoLoop(file, speed, token)); t.IsBackground = true; t.Start();
    }
    public void StopDemo() { demoToken++; demo = false; connected = false; }

    void DemoLoop(string file, double speed, int token) {
        try {
            byte[] b = File.ReadAllBytes(file);
            int tick = BitConverter.ToInt32(b, 8), siLen = BitConverter.ToInt32(b, 16), siOff = BitConverter.ToInt32(b, 20);
            int numVars = BitConverter.ToInt32(b, 24), varOff = BitConverter.ToInt32(b, 28), bl = BitConverter.ToInt32(b, 36);
            int dataOff = BitConverter.ToInt32(b, 52); if (tick <= 0) tick = 60;
            int end = Math.Max(varOff + numVars * 144, siOff + siLen);
            byte[] m = new byte[end]; Buffer.BlockCopy(b, 0, m, 0, end);
            int n = (b.Length - dataOff) / bl;
            while (token == demoToken) {
                NewGen(m, bl, 1); connected = true;
                Stopwatch sw = Stopwatch.StartNew();
                for (int r = 0; r < n && token == demoToken; r++) {
                    byte[] rec = new byte[bl]; Buffer.BlockCopy(b, dataOff + r * bl, rec, 0, bl); Push(rec);
                    double due = r / (tick * speed) * 1000.0;
                    while (sw.ElapsedMilliseconds < due && token == demoToken) Thread.Sleep(5);
                }
            }
        } catch (Exception) { if (token == demoToken) { demo = false; connected = false; } }
    }

    // ---------- http ----------
    public HttpListener Listen(int port) { HttpListener l = new HttpListener(); l.Prefixes.Add("http://localhost:" + port + "/"); l.Start(); return l; }
    public void Serve(HttpListener l) {
        while (true) {
            try { HttpListenerContext ctx = l.GetContext(); ThreadPool.QueueUserWorkItem(Handle, ctx); }
            catch (Exception) { Thread.Sleep(50); }
        }
    }
    static void Send(HttpListenerResponse res, byte[] b, string type) { res.ContentType = type; res.ContentLength64 = b.Length; res.OutputStream.Write(b, 0, b.Length); }
    static void SendJson(HttpListenerResponse res, string js) { Send(res, Encoding.UTF8.GetBytes(js), "application/json"); }
    static string J(string s) { return "\"" + (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }
    static bool SafeName(string n, string ext) { return n.Length > 0 && n.IndexOfAny(new char[] { '/', '\\' }) < 0 && !n.Contains("..") && n.EndsWith(ext, StringComparison.OrdinalIgnoreCase); }

    static string Mime(string f) {
        switch (Path.GetExtension(f).ToLowerInvariant()) {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".ico": return "image/x-icon";
            case ".woff2": return "font/woff2";
            default: return "application/octet-stream";
        }
    }

    void Handle(object o) {
        HttpListenerContext ctx = (HttpListenerContext)o; HttpListenerResponse res = ctx.Response;
        try {
            res.AddHeader("Cache-Control", "no-store");
            string p = ctx.Request.Url.AbsolutePath;
            var q = ctx.Request.QueryString;
            if (p == "/live/status") {
                string js;
                lock (lk) js = "{\"connected\":" + (connected ? "true" : "false") + ",\"gen\":" + gen + ",\"total\":" + total +
                    ",\"siUpdate\":" + siUpdate + ",\"mode\":" + (demo ? "\"replay\"" : "\"live\"") + ",\"replay\":" + J(demo ? demoName : "") + ",\"app\":true}";
                SendJson(res, js);
            } else if (p == "/live/meta") {
                byte[] m; int g, si; lock (lk) { m = meta; g = gen; si = siUpdate; }
                res.AddHeader("X-Gen", g.ToString()); res.AddHeader("X-Si", si.ToString());
                if (m == null) res.StatusCode = 404; else Send(res, m, "application/octet-stream");
            } else if (p == "/live/data") {
                long from = 0; long.TryParse(q["from"], out from);
                int max = 3600; int.TryParse(q["max"] ?? "3600", out max); if (max <= 0 || max > 3600) max = 3600;
                byte[] outb; long start, next; int g;
                lock (lk) {
                    g = gen; long lo = Math.Max(0, total - ring.Length);
                    if (from < 0) from = Math.Max(lo, total + from);           // negative = "the last N records"
                    start = Math.Max(from, lo); if (start > total) start = lo;
                    long cnt = Math.Min(total - start, max);
                    outb = new byte[cnt * bufLen];
                    for (long i = 0; i < cnt; i++) Buffer.BlockCopy(ring[(start + i) % ring.Length], 0, outb, (int)(i * bufLen), bufLen);
                    next = start + cnt;
                }
                res.AddHeader("X-Gen", g.ToString()); res.AddHeader("X-From", start.ToString()); res.AddHeader("X-Next", next.ToString());
                Send(res, outb, "application/octet-stream");
            } else if (p == "/api/files") {
                StringBuilder sb = new StringBuilder("{\"folder\":" + J(telDir) + ",\"files\":[");
                if (Directory.Exists(telDir)) {
                    List<FileInfo> fs = new List<FileInfo>(new DirectoryInfo(telDir).GetFiles("*.ibt"));
                    fs.Sort((a, b) => b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc));
                    for (int i = 0; i < fs.Count && i < 400; i++) {   // newest 400: older sessions (and other cars) show up and get learned from
                        if (i > 0) sb.Append(",");
                        sb.Append("{\"name\":" + J(fs[i].Name) + ",\"size\":" + fs[i].Length + ",\"time\":" + J(fs[i].LastWriteTime.ToString("yyyy-MM-dd HH:mm")) + "}");
                    }
                }
                sb.Append("]}"); SendJson(res, sb.ToString());
            } else if (p == "/api/file") {
                string name = q["name"] ?? ""; string f = Path.Combine(telDir, name);
                if (!SafeName(name, ".ibt") || !File.Exists(f)) { res.StatusCode = 404; }
                else using (FileStream fs = new FileStream(f, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) {
                    res.ContentType = "application/octet-stream"; res.ContentLength64 = fs.Length; fs.CopyTo(res.OutputStream);
                }
            } else if (p == "/api/setups") {
                string car = q["car"] ?? ""; string root = Path.Combine(Path.GetDirectoryName(telDir), "setups", car);
                StringBuilder sb = new StringBuilder("{\"folder\":" + J(root) + ",\"files\":[");
                if (car.Length > 0 && car.IndexOfAny(new char[] { '/', '\\', '.' }) < 0 && Directory.Exists(root)) {
                    List<FileInfo> fs = new List<FileInfo>(new DirectoryInfo(root).GetFiles("*.sto", SearchOption.AllDirectories));
                    fs.Sort((a, b) => b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc));
                    for (int i = 0; i < fs.Count && i < 400; i++) {
                        if (i > 0) sb.Append(",");
                        sb.Append("{\"rel\":" + J(fs[i].FullName.Substring(root.Length).TrimStart('\\')) + ",\"time\":" + J(fs[i].LastWriteTime.ToString("yyyy-MM-dd")) + "}");
                    }
                }
                sb.Append("]}"); SendJson(res, sb.ToString());
            } else if (p == "/api/diag") {
                // what this PC sees: iRacing running? live data shared? telemetry folder?
                string mm = "not found";
                try { using (var mmf = MemoryMappedFile.OpenExisting("Local\\IRSDKMemMapFileName", MemoryMappedFileRights.Read))
                      using (var acc = mmf.CreateViewAccessor(0, 0, MemoryMappedFileAccess.Read)) { mm = (acc.ReadInt32(4) & 1) == 1 ? "connected (in a session)" : "found, but not in a session"; } }
                catch (Exception e) { mm = "not found: " + e.GetType().Name; }
                StringBuilder procs = new StringBuilder();
                foreach (Process pr in Process.GetProcesses()) { string n = pr.ProcessName.ToLowerInvariant(); if (n.StartsWith("iracing")) { if (procs.Length > 0) procs.Append(", "); procs.Append(pr.ProcessName); } }
                int ibts = Directory.Exists(telDir) ? Directory.GetFiles(telDir, "*.ibt").Length : -1;
                string docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
                string appIni = Path.Combine(docs, "iRacing", "app.ini"), memLine = "";
                if (File.Exists(appIni)) foreach (string ln in File.ReadAllLines(appIni)) if (ln.Trim().StartsWith("irsdkEnableMem", StringComparison.OrdinalIgnoreCase)) memLine = ln.Trim();
                string js = "{\"bridge\":\"running\",\"sharedMemory\":" + J(mm) + ",\"iracingProcesses\":" + J(procs.ToString()) + ",\"documents\":" + J(docs) +
                    ",\"telemetryFolder\":" + J(telDir) + ",\"telemetryFiles\":" + ibts + ",\"irsdkEnableMem\":" + J(memLine) + ",\"demo\":" + (demo ? "true" : "false") +
                    ",\"is64bit\":" + (Environment.Is64BitProcess ? "true" : "false") + ",\"os\":" + J(Environment.OSVersion.ToString()) + "}";
                SendJson(res, js);
            } else if (p == "/api/demo/start") {
                string name = q["name"] ?? ""; double speed = 1; double.TryParse(q["speed"] ?? "1", System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out speed);
                if (speed <= 0 || speed > 50) speed = 1;
                string f = Path.Combine(telDir, name);
                if (!SafeName(name, ".ibt") || !File.Exists(f)) res.StatusCode = 404; else { StartDemo(f, speed); SendJson(res, "{\"ok\":true}"); }
            } else if (p == "/api/demo/stop") {
                StopDemo(); SendJson(res, "{\"ok\":true}");
            } else if (p.StartsWith("/logos/") && logosDir != null) {
                string name = Uri.UnescapeDataString(p.Substring(7)); string f = Path.Combine(logosDir, name);
                if (!SafeName(name, ".png") || !File.Exists(f)) res.StatusCode = 404; else Send(res, File.ReadAllBytes(f), "image/png");
            } else {
                string rel = p == "/" ? "setup-engineer.html" : Uri.UnescapeDataString(p.TrimStart('/')).Replace('/', '\\');
                string f = Path.GetFullPath(Path.Combine(webDir, rel));
                if (!f.StartsWith(webDir, StringComparison.OrdinalIgnoreCase) || !File.Exists(f)) res.StatusCode = 404;
                else Send(res, File.ReadAllBytes(f), Mime(f));
            }
        } catch (Exception) { }
        finally { try { res.Close(); } catch (Exception) { } }
    }
}

static class Program {
    static int Main(string[] args) {
        int port = 8766, parent = 0; string web = AppDomain.CurrentDomain.BaseDirectory, logos = null;
        for (int i = 0; i + 1 < args.Length; i++) {
            if (args[i] == "--port") int.TryParse(args[i + 1], out port);
            else if (args[i] == "--web") web = args[i + 1];
            else if (args[i] == "--parent") int.TryParse(args[i + 1], out parent);
            else if (args[i] == "--logos") logos = args[i + 1];
        }
        Bridge b = new Bridge(web, 72000); b.logosDir = logos;
        HttpListener l = null;
        for (int p = port; p < port + 20 && l == null; p++) { try { l = b.Listen(p); port = p; } catch (Exception) { l = null; } }
        if (l == null) { Console.WriteLine("ERROR no free port"); return 1; }
        if (parent > 0) {   // quit when the app that started us goes away
            Thread w = new Thread(() => {
                try { Process.GetProcessById(parent).WaitForExit(); } catch (Exception) { }
                Environment.Exit(0);
            });
            w.IsBackground = true; w.Start();
        }
        b.StartLive();
        Console.WriteLine("PORT " + port); Console.Out.Flush();
        b.Serve(l);
        return 0;
    }
}
