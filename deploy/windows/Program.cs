using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;

internal static class Program
{
    private static Process? application;
    private static Task shutdown = Task.CompletedTask;
    private static TimeSpan shutdownGrace = TimeSpan.FromSeconds(35);
    private static readonly bool Chinese = System.Globalization.CultureInfo.CurrentUICulture.Name.StartsWith("zh", StringComparison.OrdinalIgnoreCase);
    private static readonly ConsoleHandler CloseHandler = HandleConsoleClose;
    private delegate bool ConsoleHandler(uint signal);
    [DllImport("Kernel32")] private static extern bool SetConsoleCtrlHandler(ConsoleHandler handler, bool add);
    private static void Say(string zh, string en) => Console.WriteLine(Chinese ? zh : en);
    private static string Choose(string zh, string en, string fallback)
    {
        Say(zh, en);
        Console.Write($"[{fallback}]: ");
        return Console.ReadLine()?.Trim() is { Length: > 0 } value ? value : fallback;
    }

    private static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        FileStream? lease = null;
        string? endpointFile = null;
        try
        {
            if (!OperatingSystem.IsWindows() || RuntimeInformation.ProcessArchitecture != Architecture.X64)
                throw new InvalidOperationException("Windows x64 is required.");
            if (args.Length != 0 && !(args.Length == 2 && args[0] == "--self-test"))
                throw new InvalidOperationException("Usage: Nowluma.exe [--self-test <isolated-directory>]");
            bool selfTest = args.Length == 2;
            string root = selfTest ? Path.GetFullPath(args[1]) : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Nowluma");
            RejectLinks(root);
            Directory.CreateDirectory(root);
            endpointFile = Path.Combine(root, ".launcher-endpoint");
            RejectLinks(endpointFile);
            RejectLinks(Path.Combine(root, ".launcher-lock"));
            try { lease = new FileStream(Path.Combine(root, ".launcher-lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException error) when ((error.HResult & 0xffff) == 32)
            {
                Say("Nowluma 已运行，正在打开控制台。", "Nowluma is already running. Opening its console.");
                if (!selfTest && File.Exists(endpointFile)) OpenConsole(File.ReadAllText(endpointFile));
                return 0;
            }
            File.Delete(endpointFile);
            InstallPayload(root);
            if (selfTest)
            {
                await SelfTest(root);
                return 0;
            }
            Say("Nowluma 正在启动，无需 Docker、Node 或 .NET 安装。", "Starting Nowluma. No Docker, Node or .NET installation is required.");
            Say("保存目录：" + root, "Data directory: " + root);
            Say("运行环境：本机 QQ。浏览器桌面隔离环境需要已有 Linux Docker 引擎。", "Environment: local QQ. An isolated browser desktop requires an existing Linux Docker engine.");
            string modeFile = Path.Combine(root, ".launcher-mode");
            RejectLinks(modeFile);
            string previousMode = File.Exists(modeFile) ? File.ReadAllText(modeFile) : "1";
            if (previousMode is not ("1" or "2")) throw new InvalidOperationException("Invalid saved environment choice; it was not replaced.");
            bool dockerAvailable = WindowsContainer.Available();
            string mode = dockerAvailable
                ? Choose("选择：1. 本机 QQ  2. 已有 Docker 隔离桌面  0. 退出", "Choose: 1. Local QQ  2. Existing Docker isolated desktop  0. Exit", previousMode)
                : Choose("未检测到运行中的 Linux Docker：1. 本机 QQ  0. 退出", "No running Linux Docker engine: 1. Local QQ  0. Exit", previousMode == "2" ? "0" : "1");
            if (mode == "0") return 0;
            if (mode is not ("1" or "2") || (mode == "2" && !dockerAvailable)) throw new InvalidOperationException("Invalid environment choice.");
            File.WriteAllText(modeFile, mode);
            if (mode == "2")
                return await WindowsContainer.Run(root, endpoint =>
                {
                    File.WriteAllText(endpointFile, LocalConsoleUrl(endpoint), new UTF8Encoding(false));
                    OpenConsole(endpoint);
                }, Choose, Say);
            if (!await QqSetup.Prepare(root, Choose, Say)) return 0;
            Console.CancelKeyPress += CancelKeyPress;
            SetConsoleCtrlHandler(CloseHandler, true);
            try
            {
                return await RunApplication(root, "index.mjs", endpoint =>
                {
                    File.WriteAllText(endpointFile, endpoint, new UTF8Encoding(false));
                    Say("控制台地址：" + endpoint, "Console: " + endpoint);
                    OpenConsole(endpoint);
                    Say("首次密码在上方 initial credentials 一行；请在浏览器中完成引导。", "Find the first password in the 'initial credentials' line above, then complete browser setup.");
                    Say("建议按 Ctrl+C 正常停止（最多等待 35 秒）；直接关闭窗口时 Windows 可能提前强制结束。QQ 用户数据和设置不会被删除。", "Use Ctrl+C for graceful shutdown (up to 35 seconds); closing the window lets Windows terminate it sooner. QQ data and settings are not deleted.");
                    return Task.CompletedTask;
                }, TimeSpan.FromSeconds(45));
            }
            finally
            {
                Console.CancelKeyPress -= CancelKeyPress;
                SetConsoleCtrlHandler(CloseHandler, false);
            }
        }
        catch (Exception error)
        {
            RequestStop();
            Console.Error.WriteLine(error.Message);
            Say("启动失败，已有设置不会被清空。按回车关闭。", "Startup failed; existing settings are preserved. Press Enter to close.");
            if (!Console.IsInputRedirected) Console.ReadLine();
            return 1;
        }
        finally
        {
            RequestStop();
            await shutdown;
            if (lease is not null && endpointFile is not null) File.Delete(endpointFile);
            lease?.Dispose();
        }
    }

    private static void CancelKeyPress(object? sender, ConsoleCancelEventArgs args)
    {
        args.Cancel = true;
        RequestStop();
    }

    private static async Task<int> RunApplication(string root, string entry, Func<string, Task> onReady, TimeSpan startupTimeout)
    {
        var start = new ProcessStartInfo(Path.Combine(root, "node.exe"))
        {
            WorkingDirectory = root,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        start.ArgumentList.Add(Path.Combine(root, entry));
        start.Environment["NOWLUMA_LAUNCHER_CONTROL"] = "1";
        using var child = new Process { StartInfo = start, EnableRaisingEvents = true };
        var exited = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        child.Exited += (_, _) => exited.TrySetResult();
        var ready = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        child.OutputDataReceived += (_, e) =>
        {
            if (e.Data is null) return;
            Console.WriteLine(e.Data);
            var match = Regex.Match(e.Data, @"listening (https?://\S+)");
            if (match.Success) ready.TrySetResult(match.Groups[1].Value);
        };
        child.ErrorDataReceived += (_, e) => { if (e.Data is not null) Console.Error.WriteLine(e.Data); };
        if (!child.Start()) throw new InvalidOperationException("Could not start Node.");
        application = child;
        shutdown = Task.CompletedTask;
        try
        {
            child.BeginOutputReadLine(); child.BeginErrorReadLine();
            var winner = await Task.WhenAny(ready.Task, exited.Task, Task.Delay(startupTimeout));
            if (winner != ready.Task)
                throw new InvalidOperationException(winner == exited.Task
                    ? $"Console exited before startup (exit {child.ExitCode}). See the output above."
                    : "Console startup timed out. See the output above.");
            await onReady(LocalConsoleUrl(await ready.Task));
            await exited.Task;
            return child.ExitCode;
        }
        finally
        {
            RequestStop();
            try
            {
                await shutdown;
                await child.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(1));
            }
            finally
            {
                lock (child)
                {
                    application = null;
                    shutdown = Task.CompletedTask;
                }
            }
        }
    }

    private static void RequestStop()
    {
        var child = application;
        if (child is null) return;
        lock (child)
        {
            if (application != child || !shutdown.IsCompleted || child.HasExited) return;
            shutdown = StopApplication(child);
        }
    }

    private static async Task StopApplication(Process child)
    {
        var exited = child.WaitForExitAsync();
        var deadline = Task.Delay(shutdownGrace);
        await Task.WhenAny(SendShutdown(child), deadline);
        if (await Task.WhenAny(exited, deadline) != exited && !child.HasExited)
        {
            Console.Error.WriteLine("Shutdown grace period expired; terminating the launcher runtime process tree.");
            try { child.Kill(entireProcessTree: true); }
            catch (InvalidOperationException) when (child.HasExited) { }
        }
        await exited.WaitAsync(TimeSpan.FromSeconds(1));
    }

    private static async Task SendShutdown(Process child)
    {
        try
        {
            await child.StandardInput.WriteLineAsync("shutdown");
            await child.StandardInput.FlushAsync();
            child.StandardInput.Close();
        }
        catch (IOException) { }
        catch (InvalidOperationException) { }
    }

    private static bool HandleConsoleClose(uint signal)
    {
        if (signal is not (2 or 5 or 6)) return false;
        RequestStop();
        try
        {
            // Windows gives console-close handlers only a short cleanup window.
            if (!shutdown.Wait(TimeSpan.FromSeconds(3)) && application is { HasExited: false } child)
            {
                Console.Error.WriteLine("Console close deadline expired; terminating the launcher runtime process tree.");
                try { child.Kill(entireProcessTree: true); }
                catch (InvalidOperationException) when (child.HasExited) { }
            }
            if (!shutdown.Wait(TimeSpan.FromSeconds(1))) Console.Error.WriteLine("Runtime cleanup did not finish before console close.");
        }
        catch (Exception error) { Console.Error.WriteLine("Runtime cleanup failed: " + error.Message); }
        return false;
    }

    internal static void RejectLinks(string path)
    {
        for (string? current = Path.GetFullPath(path); current is not null; current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("Launcher path uses a link: " + current);
    }
    private static string LocalConsoleUrl(string raw)
    {
        var url = new Uri(raw.Trim());
        if (url.Scheme is not ("http" or "https") || url.UserInfo.Length != 0 || url.Query.Length != 0 || url.Fragment.Length != 0)
            throw new InvalidOperationException("Invalid console address.");
        if (url.Host is not ("localhost" or "127.0.0.1" or "0.0.0.0" or "[::]" or "[::1]") || url.Port <= 0)
            throw new InvalidOperationException("Console must be on this computer.");
        return new UriBuilder(url) { Host = url.Host is "[::]" or "[::1]" ? "::1" : "127.0.0.1", Path = "/" }.Uri.AbsoluteUri;
    }
    private static void OpenConsole(string endpoint) => Process.Start(new ProcessStartInfo(LocalConsoleUrl(endpoint)) { UseShellExecute = true });

    private static void InstallPayload(string root)
    {
        string manifest = Path.Combine(root, "release.json");
        string installedPayload = Path.Combine(root, ".launcher-payload");
        RejectLinks(manifest);
        RejectLinks(installedPayload);
        if (File.Exists(manifest))
        {
            using var current = JsonDocument.Parse(File.ReadAllText(manifest));
            string version = current.RootElement.GetProperty("version").GetString()!;
            if (CompareVersions(version, PayloadInfo.Version) > 0) return;
            if (version == PayloadInfo.Version && File.Exists(Path.Combine(root, "node.exe")) &&
                File.Exists(installedPayload) && File.ReadAllText(installedPayload) == PayloadInfo.Sha256) return;
        }
        using var payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("Nowluma.Payload") ?? throw new InvalidOperationException("Missing runtime payload.");
        if (Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant() != PayloadInfo.Sha256) throw new InvalidOperationException("Runtime payload checksum mismatch.");
        payload.Position = 0;
        using var archive = new ZipArchive(payload, ZipArchiveMode.Read);
        var entry = archive.GetEntry("release.json") ?? throw new InvalidOperationException("Missing release manifest.");
        using var stream = entry.Open();
        using var release = JsonDocument.Parse(stream);
        if (release.RootElement.GetProperty("target").GetString() != "win32-x64" || release.RootElement.GetProperty("version").GetString() != PayloadInfo.Version)
            throw new InvalidOperationException("Runtime release does not match this launcher.");
        var allowed = release.RootElement.GetProperty("entries").EnumerateArray().Select(e => e.GetString()!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        allowed.Add("node.exe");
        var archiveNames = archive.Entries.Where(e => !e.FullName.EndsWith('/')).Select(e => e.FullName).ToList();
        if (archiveNames.Count != archiveNames.Distinct(StringComparer.OrdinalIgnoreCase).Count()) throw new InvalidOperationException("Duplicate runtime archive paths.");
        foreach (string required in new[] { "index.mjs", "node.exe", "client/index.html", "LICENSE", "release.json" })
            if (!archiveNames.Contains(required, StringComparer.OrdinalIgnoreCase)) throw new InvalidOperationException("Incomplete runtime payload: " + required);
        if (allowed.Overlaps(new[] { "config", "data", "logs" })) throw new InvalidOperationException("Runtime payload must not contain user data.");
        string temporary = Path.Combine(root, ".install-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temporary);
        var changed = new List<(string Target, string? Backup)>();
        bool safeToClean = false;
        try
        {
            foreach (var file in archive.Entries)
            {
                string name = file.FullName.Replace('\\', '/');
                if (name.EndsWith('/')) continue;
                if (name.Split('/').Any(p => p.Length == 0 || p is "." or "..") || name.Contains(':') || !allowed.Contains(name.Split('/')[0]))
                    throw new InvalidOperationException("Invalid runtime archive path.");
                string target = Path.GetFullPath(Path.Combine(root, name));
                if (!target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Runtime archive escaped its directory.");
                string staged = Path.Combine(temporary, "new", name);
                for (string? parent = Path.GetDirectoryName(target); parent is not null && parent.StartsWith(root, StringComparison.OrdinalIgnoreCase); parent = Path.GetDirectoryName(parent))
                    if (Directory.Exists(parent) && (File.GetAttributes(parent) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("Runtime path uses a link: " + parent);
                Directory.CreateDirectory(Path.GetDirectoryName(staged)!);
                file.ExtractToFile(staged);
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                string? backup = null;
                if (File.Exists(target))
                {
                    if ((File.GetAttributes(target) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("Runtime file uses a link: " + target);
                    backup = Path.Combine(temporary, "old", name);
                    Directory.CreateDirectory(Path.GetDirectoryName(backup)!);
                    File.Copy(target, backup);
                }
                changed.Add((target, backup));
                File.Move(staged, target, true);
            }
            string marker = Path.Combine(temporary, "marker");
            File.WriteAllText(marker, PayloadInfo.Sha256);
            string? oldMarker = File.Exists(installedPayload) ? Path.Combine(temporary, "old-marker") : null;
            if (oldMarker is not null) File.Copy(installedPayload, oldMarker);
            changed.Add((installedPayload, oldMarker));
            File.Move(marker, installedPayload, true);
            safeToClean = true;
        }
        catch (Exception original)
        {
            try
            {
                foreach (var file in changed.AsEnumerable().Reverse())
                {
                    if (file.Backup is null) File.Delete(file.Target);
                    else File.Copy(file.Backup, file.Target, true);
                }
                safeToClean = true;
            }
            catch (Exception rollback)
            {
                throw new AggregateException("Rollback failed; recovery files are preserved at " + temporary, original, rollback);
            }
            throw;
        }
        finally
        {
            if (safeToClean)
            {
                try { Directory.Delete(temporary, true); }
                catch (IOException) { Console.Error.WriteLine("Installer cleanup incomplete: " + temporary); }
            }
        }
    }

    private static int CompareVersions(string left, string right)
    {
        string[] a = left.Split('-', 2), b = right.Split('-', 2);
        int numeric = Version.Parse(a[0]).CompareTo(Version.Parse(b[0]));
        if (numeric != 0) return numeric;
        if (a.Length == 1) return b.Length == 1 ? 0 : 1;
        if (b.Length == 1) return -1;
        string[] ai = a[1].Split('.'), bi = b[1].Split('.');
        for (int i = 0; i < Math.Min(ai.Length, bi.Length); i++)
        {
            bool an = int.TryParse(ai[i], out int av), bn = int.TryParse(bi[i], out int bv);
            int compare = an && bn ? av.CompareTo(bv) : an != bn ? an ? -1 : 1 : string.CompareOrdinal(ai[i], bi[i]);
            if (compare != 0) return compare;
        }
        return ai.Length.CompareTo(bi.Length);
    }

    private static async Task SelfTest(string root)
    {
        var start = new ProcessStartInfo(Path.Combine(root, "node.exe")) { WorkingDirectory = root, UseShellExecute = false, RedirectStandardOutput = true };
        start.ArgumentList.Add("-e");
        start.ArgumentList.Add("const fs=require('node:fs'); if(process.versions.node!=='24.22.1') throw Error('Unexpected Node'); const r=JSON.parse(fs.readFileSync('release.json')); if(r.target!=='win32-x64') throw Error('Unexpected platform'); console.log('PASS: bundled Node and stable Windows working directory');");
        using var child = Process.Start(start) ?? throw new InvalidOperationException("Bundled Node could not start.");
        Console.Write(await child.StandardOutput.ReadToEndAsync());
        await child.WaitForExitAsync();
        if (child.ExitCode != 0) throw new InvalidOperationException("Bundled runtime check failed.");
        if (CompareVersions("2.5.0-rc.2", "2.5.0-rc.1") <= 0 || CompareVersions("2.5.0", "2.5.0-rc.2") <= 0)
            throw new InvalidOperationException("Version ordering check failed.");
        foreach (string invalid in new[] { "https://example.com/", "http://user:secret@localhost:5099/", "http://localhost:5099/?token=secret", "http://localhost:0/", "file:///C:/test" })
        {
            try { LocalConsoleUrl(invalid); throw new Exception("Unsafe endpoint accepted."); }
            catch (InvalidOperationException) { }
        }
        if (LocalConsoleUrl("http://[::]:5100/console") != "http://[::1]:5100/" || LocalConsoleUrl("http://[::1]:5101/") != "http://[::1]:5101/")
            throw new InvalidOperationException("IPv6 console endpoint check failed.");
        string fixture = Path.Combine(root, ".launcher-fixture.mjs");
        RejectLinks(fixture);
        try
        {
            shutdownGrace = TimeSpan.FromSeconds(1);
            File.WriteAllText(fixture, """
                import http from 'node:http';
                import { createInterface } from 'node:readline';
                if (process.env.NOWLUMA_LAUNCHER_CONTROL !== '1') throw Error('Missing launcher control');
                const server = http.createServer((req, res) => {
                    res.writeHead(401); res.end('FIXTURE ONLY: authentication required');
                }).listen(0, '127.0.0.1', () => console.log(`listening http://0.0.0.0:${server.address().port}`));
                createInterface({ input: process.stdin }).on('line', line => {
                    if (line !== 'shutdown') throw Error('Unexpected launcher command');
                    console.log('PASS: fixture received stdin shutdown');
                    server.close(() => setTimeout(() => console.log('PASS: fixture in-flight cleanup completed'), 250));
                });
                """);
            int result = await RunApplication(root, Path.GetFileName(fixture), async endpoint =>
            {
                using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
                using var response = await client.GetAsync(endpoint);
                if (response.StatusCode != System.Net.HttpStatusCode.Unauthorized || new Uri(endpoint).Port == 0)
                    throw new InvalidOperationException("Fixture endpoint check failed.");
                RequestStop();
            }, TimeSpan.FromSeconds(5));
            if (result != 0) throw new InvalidOperationException("Fixture shutdown failed.");
            Console.WriteLine("PASS: actual launcher startup, auto-port endpoint and graceful shutdown (fixture only)");
            foreach (bool earlyExit in new[] { true, false })
            {
                File.WriteAllText(fixture, earlyExit
                    ? "console.error('FIXTURE startup error detail'); process.exit(17);"
                    : "import { spawn } from 'node:child_process'; const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); console.log('FIXTURE stalled runtime pid=' + process.pid + ' child=' + child.pid); setInterval(() => {}, 1000);");
                try
                {
                    await RunApplication(root, Path.GetFileName(fixture), _ => throw new InvalidOperationException("Unexpected readiness"), TimeSpan.FromSeconds(1));
                    throw new InvalidOperationException("Failed fixture unexpectedly started.");
                }
                catch (InvalidOperationException error) when (earlyExit ? error.Message.Contains("exit 17") : error.Message.Contains("timed out")) { }
            }
            Console.WriteLine("PASS: startup failure detail and bounded stalled-runtime cleanup (fixture only)");
        }
        finally
        {
            File.Delete(fixture);
            shutdownGrace = TimeSpan.FromSeconds(35);
        }
        await WindowsContainerSelfTest.Run(root);
    }
}
