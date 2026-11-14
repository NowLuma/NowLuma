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
    private static int stopping;
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
        bool processStarted = false;
        try
        {
            if (!OperatingSystem.IsWindows() || RuntimeInformation.ProcessArchitecture != Architecture.X64)
                throw new InvalidOperationException("Windows x64 is required.");
            bool selfTest = args.Length == 2 && args[0] == "--self-test";
            string root = selfTest ? Path.GetFullPath(args[1]) : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Nowluma");
            Directory.CreateDirectory(root);
            string endpointFile = Path.Combine(root, ".launcher-endpoint");
            try { lease = new FileStream(Path.Combine(root, ".launcher-lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException error) when ((error.HResult & 0xffff) == 32)
            {
                Say("Nowluma 已运行，正在打开控制台。", "Nowluma is already running. Opening its console.");
                if (File.Exists(endpointFile)) OpenConsole(File.ReadAllText(endpointFile));
                return 0;
            }
            {
                InstallPayload(root);
                if (selfTest)
                {
                    await SelfTest(root);
                    return 0;
                }
                Say("Nowluma 正在启动，无需 Docker、Node 或 .NET 安装。", "Starting Nowluma. No Docker, Node or .NET installation is required.");
                Say("保存目录：" + root, "Data directory: " + root);
                Say("运行环境：本机 QQ（默认）。浏览器桌面隔离环境需要已有 Linux Docker 引擎。", "Environment: local QQ (default). An isolated browser desktop requires an existing Linux Docker engine.");
                if (WindowsContainer.Available() && Choose("选择：1. 本机 QQ  2. 已有 Docker 隔离桌面", "Choose: 1. Local QQ  2. Existing Docker isolated desktop", "1") == "2")
                    return await WindowsContainer.Run(root, OpenConsole, Choose, Say);
                await QqSetup.Prepare(root, Choose, Say);
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
                start.ArgumentList.Add(Path.Combine(root, "index.mjs"));
                start.Environment["NOWLUMA_LAUNCHER_CONTROL"] = "1";
                application = new Process { StartInfo = start };
                var ready = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
                application.OutputDataReceived += (_, e) =>
                {
                    if (e.Data is null) return;
                    Console.WriteLine(e.Data);
                    var match = Regex.Match(e.Data, @"listening (https?://\S+)");
                    if (match.Success) ready.TrySetResult(match.Groups[1].Value);
                };
                application.ErrorDataReceived += (_, e) => { if (e.Data is not null) Console.Error.WriteLine(e.Data); };
                Console.CancelKeyPress += (_, e) => { e.Cancel = true; RequestStop(); };
                SetConsoleCtrlHandler(CloseHandler, true);
                if (!application.Start()) throw new InvalidOperationException("Could not start Node.");
                processStarted = true;
                application.BeginOutputReadLine(); application.BeginErrorReadLine();
                var exited = application.WaitForExitAsync();
                var winner = await Task.WhenAny(ready.Task, exited, Task.Delay(TimeSpan.FromSeconds(45)));
                if (winner != ready.Task)
                {
                    RequestStop();
                    throw new InvalidOperationException("Console startup failed. See the output above.");
                }
                string endpoint = LocalConsoleUrl(await ready.Task);
                File.WriteAllText(endpointFile, endpoint, new UTF8Encoding(false));
                Say("控制台地址：" + endpoint, "Console: " + endpoint);
                OpenConsole(endpoint);
                Say("首次密码在上方 initial credentials 一行；请在浏览器中完成引导。", "Find the first password in the 'initial credentials' line above, then complete browser setup.");
                Say("关闭窗口或按 Ctrl+C 会正常停止服务；QQ 用户数据和程序设置会保留。", "Closing this window or pressing Ctrl+C stops the service; QQ data and settings are preserved.");
                await exited;
                return application.ExitCode;
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
            if (processStarted && application is { HasExited: false }) await application.WaitForExitAsync();
            application?.Dispose();
            lease?.Dispose();
        }
    }

    private static void RequestStop()
    {
        if (application is null) return;
        try
        {
            if (application.HasExited || Interlocked.Exchange(ref stopping, 1) != 0) return;
            application.StandardInput.WriteLine("shutdown");
            application.StandardInput.Flush();
            application.StandardInput.Close();
        }
        catch (IOException) { }
        catch (InvalidOperationException) { }
    }
    private static bool HandleConsoleClose(uint signal)
    {
        if (signal is not (2 or 5 or 6)) return false;
        RequestStop();
        try { application?.WaitForExit(5000); } catch (InvalidOperationException) { }
        return false;
    }
    private static string LocalConsoleUrl(string raw)
    {
        var url = new Uri(raw.Trim());
        if (url.Scheme is not ("http" or "https") || url.UserInfo.Length != 0 || url.Query.Length != 0 || url.Fragment.Length != 0)
            throw new InvalidOperationException("Invalid console address.");
        if (url.Host is not ("localhost" or "127.0.0.1" or "0.0.0.0" or "[::]" or "[::1]"))
            throw new InvalidOperationException("Console must be on this computer.");
        return new UriBuilder(url) { Host = "127.0.0.1", Path = "/" }.Uri.AbsoluteUri;
    }
    private static void OpenConsole(string endpoint) => Process.Start(new ProcessStartInfo(LocalConsoleUrl(endpoint)) { UseShellExecute = true });

    private static void InstallPayload(string root)
    {
        string manifest = Path.Combine(root, "release.json");
        string installedPayload = Path.Combine(root, ".launcher-payload");
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
            File.WriteAllText(installedPayload, PayloadInfo.Sha256);
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
    }
}
