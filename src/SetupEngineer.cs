// Setup Engineer - Windows app
// Reads iRacing live telemetry (shared memory) and recorded .ibt files, serves the analysis page
// on localhost and shows it in its own app window (Edge/Chrome app mode). Build with build.ps1.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Setup Engineer")]
[assembly: AssemblyProduct("Setup Engineer")]
[assembly: AssemblyVersion("1.0.0.0")]

public class IRBridge {
    readonly object lk = new object();
    byte[][] ring; long total = 0; int gen = 0; int bufLen = 0; byte[] meta = null; int siUpdate = -1;
    volatile bool connected = false;
    string appDir; string telDir;

    public IRBridge(string appDir, int cap) {
        this.appDir = appDir; ring = new byte[cap][];
        telDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "iRacing", "telemetry");
    }

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
                            if (acc.ReadInt32(48 + e[2] * 16) != e[0]) continue;
                            Push(rec); lastTick = e[0];
                        }
                        Thread.Sleep(4);
                    }
                }
            } catch (Exception) { connected = false; Thread.Sleep(1000); }
        }
    }

    public HttpListener Listen(int port) {
        HttpListener l = new HttpListener(); l.Prefixes.Add("http://localhost:" + port + "/"); l.Start(); return l;
    }

    public void Serve(HttpListener l) {
        while (true) {
            try { HttpListenerContext ctx = l.GetContext(); ThreadPool.QueueUserWorkItem(Handle, ctx); }
            catch (Exception) { Thread.Sleep(50); }
        }
    }

    static void Send(HttpListenerResponse res, byte[] b, string type) {
        res.ContentType = type; res.ContentLength64 = b.Length; res.OutputStream.Write(b, 0, b.Length);
    }
    static string J(string s) { return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }

    byte[] PageBytes() {
        string f = Path.Combine(appDir, "setup-engineer.html");
        if (File.Exists(f)) return File.ReadAllBytes(f);
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("page.html")) {
            if (s == null) return Encoding.UTF8.GetBytes("setup-engineer.html missing");
            MemoryStream ms = new MemoryStream(); s.CopyTo(ms); return ms.ToArray();
        }
    }

    void Handle(object o) {
        HttpListenerContext ctx = (HttpListenerContext)o; HttpListenerResponse res = ctx.Response;
        try {
            res.AddHeader("Cache-Control", "no-store");
            string p = ctx.Request.Url.AbsolutePath;
            if (p == "/live/status") {
                string js;
                lock (lk) js = "{\"connected\":" + (connected ? "true" : "false") + ",\"gen\":" + gen + ",\"total\":" + total +
                    ",\"siUpdate\":" + siUpdate + ",\"mode\":\"live\",\"app\":true}";
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
            } else if (p == "/api/files") {
                StringBuilder sb = new StringBuilder("{\"folder\":" + J(telDir) + ",\"files\":[");
                if (Directory.Exists(telDir)) {
                    List<FileInfo> fs = new List<FileInfo>(new DirectoryInfo(telDir).GetFiles("*.ibt"));
                    fs.Sort((a, b) => b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc));
                    for (int i = 0; i < fs.Count && i < 60; i++) {
                        if (i > 0) sb.Append(",");
                        sb.Append("{\"name\":" + J(fs[i].Name) + ",\"size\":" + fs[i].Length + ",\"time\":" +
                            J(fs[i].LastWriteTime.ToString("yyyy-MM-dd HH:mm")) + "}");
                    }
                }
                sb.Append("]}");
                Send(res, Encoding.UTF8.GetBytes(sb.ToString()), "application/json");
            } else if (p == "/api/setups") {
                string car = ctx.Request.QueryString["car"] ?? "";
                string root = Path.Combine(Path.GetDirectoryName(telDir), "setups", car);
                StringBuilder sb = new StringBuilder("{\"folder\":" + J(root) + ",\"files\":[");
                if (car.Length > 0 && car.IndexOfAny(new char[] { '/', '\\', '.' }) < 0 && Directory.Exists(root)) {
                    List<FileInfo> fs = new List<FileInfo>(new DirectoryInfo(root).GetFiles("*.sto", SearchOption.AllDirectories));
                    fs.Sort((a, b) => b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc));
                    for (int i = 0; i < fs.Count && i < 400; i++) {
                        if (i > 0) sb.Append(",");
                        sb.Append("{\"rel\":" + J(fs[i].FullName.Substring(root.Length).TrimStart('\\')) + ",\"time\":" + J(fs[i].LastWriteTime.ToString("yyyy-MM-dd")) + "}");
                    }
                }
                sb.Append("]}");
                Send(res, Encoding.UTF8.GetBytes(sb.ToString()), "application/json");
            } else if (p == "/api/file") {
                string name = ctx.Request.QueryString["name"] ?? "";
                string f = Path.Combine(telDir, name);
                if (name.IndexOfAny(new char[] { '/', '\\' }) >= 0 || name.Contains("..") || !name.EndsWith(".ibt", StringComparison.OrdinalIgnoreCase) || !File.Exists(f)) {
                    res.StatusCode = 404;
                } else {
                    using (FileStream fs = new FileStream(f, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) {
                        res.ContentType = "application/octet-stream"; res.ContentLength64 = fs.Length; fs.CopyTo(res.OutputStream);
                    }
                }
            } else if (p == "/" || p == "/index.html" || p == "/setup-engineer.html") {
                Send(res, PageBytes(), "text/html; charset=utf-8");
            } else res.StatusCode = 404;
        } catch (Exception) { }
        finally { try { res.Close(); } catch (Exception) { } }
    }
}

static class App {
    static NotifyIcon tray; static int port; static string url;

    static bool Ping(int p) {
        try {
            HttpWebRequest r = (HttpWebRequest)WebRequest.Create("http://localhost:" + p + "/live/status"); r.Timeout = 800;
            using (WebResponse w = r.GetResponse()) using (StreamReader sr = new StreamReader(w.GetResponseStream()))
                return sr.ReadToEnd().Contains("\"app\":true");
        } catch (Exception) { return false; }
    }

    static string FindBrowser() {
        string[] c = {
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "", @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles") ?? "", @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles") ?? "", @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "", @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe") };
        foreach (string f in c) if (File.Exists(f)) return f;
        return null;
    }

    static void OpenWindow(bool exitWhenClosed) {
        string b = FindBrowser();
        if (b == null) { Process.Start(url); return; }
        string prof = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SetupEngineer", "window");
        ProcessStartInfo psi = new ProcessStartInfo(b, "--app=" + url + " --user-data-dir=\"" + prof + "\" --window-size=1320,920 --no-first-run --no-default-browser-check");
        psi.UseShellExecute = false;
        Process proc = Process.Start(psi);
        if (!exitWhenClosed || proc == null) return;
        DateTime t0 = DateTime.Now;
        Thread w = new Thread(() => {
            proc.WaitForExit();
            // if the window process lived on its own (not handed to an existing window), closing it closes the app
            if ((DateTime.Now - t0).TotalSeconds > 4) { tray.Visible = false; Environment.Exit(0); }
        });
        w.IsBackground = true; w.Start();
    }

    [STAThread]
    static void Main() {
        bool first; Mutex mx = new Mutex(true, "SetupEngineerApp", out first);
        if (!first) {
            for (int p = 8766; p < 8776; p++) if (Ping(p)) { port = p; url = "http://localhost:" + p + "/"; OpenWindow(false); return; }
            return;
        }
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        IRBridge bridge = new IRBridge(dir, 72000);
        HttpListener l = null;
        for (port = 8766; port < 8776 && l == null; port++) { try { l = bridge.Listen(port); } catch (Exception) { l = null; } }
        port--;
        if (l == null) { MessageBox.Show("Setup Engineer could not start its local server (ports 8766-8775 busy).", "Setup Engineer"); return; }
        url = "http://localhost:" + port + "/";
        bridge.StartLive();
        Thread srv = new Thread(() => bridge.Serve(l)); srv.IsBackground = true; srv.Start();

        Application.EnableVisualStyles();
        tray = new NotifyIcon();
        try { tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { tray.Icon = SystemIcons.Application; }
        tray.Text = "Setup Engineer";
        ContextMenu menu = new ContextMenu();
        menu.MenuItems.Add("Open Setup Engineer", (s, e) => OpenWindow(false));
        menu.MenuItems.Add("Exit", (s, e) => { tray.Visible = false; Application.Exit(); });
        tray.ContextMenu = menu;
        tray.DoubleClick += (s, e) => OpenWindow(false);
        tray.Visible = true;
        OpenWindow(true);
        Application.Run();
        GC.KeepAlive(mx);
    }
}
