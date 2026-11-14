using System.Diagnostics;
using System.Security.Cryptography;
using Microsoft.Win32;

[System.Runtime.Versioning.SupportedOSPlatform("windows")]
internal static class QqSetup
{
    internal const string FileName = "QQ_9.9.37_261103_x64_01.exe";
    internal const string OfficialUrl = "https://qqdl.gtimg.cn/qqfile/QQNTV2/9.9.37/release/a2ca1b61/" + FileName;
    internal const string MirrorUrl = "https://github.com/a1515333102/QQ-Releases/releases/download/9.9.37%2B3.2.35/" + FileName;
    internal const string Sha256 = "5cd7c13e36b391f88b2ad272fa870d74f476135b64244844ec0ad7ac7b411b48";

    internal static string? FindInstalled()
    {
        var processes = Process.GetProcessesByName("QQ");
        try
        {
            foreach (var process in processes)
            {
                try
                {
                    if (process.MainModule?.FileName is string exe) return exe;
                }
                catch (System.ComponentModel.Win32Exception) { }
            }
        }
        finally { foreach (var process in processes) process.Dispose(); }
        foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
            foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
            {
                using var registry = RegistryKey.OpenBaseKey(hive, view);
                using var app = registry.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\QQ.exe");
                if (app?.GetValue(null) is string exe && File.Exists(exe)) return exe;
                using var qq = registry.OpenSubKey(@"SOFTWARE\Tencent\QQNT");
                if (qq?.GetValue("InstallPath") is string install && File.Exists(Path.Combine(install, "QQ.exe"))) return Path.Combine(install, "QQ.exe");
            }
        foreach (string folder in new[] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) })
        {
            string exe = Path.Combine(folder, "Tencent", "QQNT", "QQ.exe");
            if (File.Exists(exe)) return exe;
        }
        return null;
    }

    internal static async Task<bool> Prepare(string root, Func<string, string, string, string> choose, Action<string, string> say)
    {
        string? exe = FindInstalled();
        if (exe is null)
        {
            string answer = choose("没有检测到本机 QQ：1. 自己安装  2. 协助下载安装  0. 退出", "QQ not found: 1. Install it yourself  2. Download and open its installer  0. Exit", "1");
            if (answer == "0") return false;
            if (answer is not ("1" or "2")) throw new InvalidOperationException("Invalid QQ setup choice.");
            if (answer == "2")
            {
                string temporary = Path.Combine(root, ".qq-setup-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(temporary);
                string installer = Path.Combine(temporary, FileName);
                try
                {
                    say("正在下载官方 QQ 9.9.37 安装包……", "Downloading the official QQ 9.9.37 installer…");
                    try { await Download(OfficialUrl, installer); }
                    catch (Exception error) when (error is HttpRequestException or OperationCanceledException)
                    {
                        if (File.Exists(installer)) File.Delete(installer);
                        say("官方下载暂不可用：" + error.Message, "Official download unavailable: " + error.Message);
                        say("镜像提供同一固定安装包，下载后仍会校验 SHA-256 与腾讯签名。", "The mirror supplies the same pinned installer, verified by SHA-256 and Tencent signature.");
                        if (choose("是否从 QQ-Releases 第三方镜像下载？", "Download from the third-party QQ-Releases mirror?", "n") is not ("y" or "Y" or "yes"))
                        {
                            say("未安装 QQ。可以手动安装后重新启动 Nowluma。", "QQ was not installed. Install it manually and restart Nowluma.");
                            return false;
                        }
                        await Download(MirrorUrl, installer);
                    }
                    await VerifySignature(installer);
                    say("即将打开 QQ 官方安装界面，请按提示完成安装。", "Opening the official QQ installer. Follow its setup prompts.");
                    using var setup = Process.Start(new ProcessStartInfo(installer) { UseShellExecute = true }) ?? throw new InvalidOperationException("QQ installer could not start.");
                    await setup.WaitForExitAsync();
                    if (setup.ExitCode is 3010 or 1641)
                    {
                        say("QQ 安装要求重启 Windows。重启后请重新打开 Nowluma。", "QQ setup requires a Windows restart. Reopen Nowluma after restarting.");
                        return false;
                    }
                    if (setup.ExitCode != 0)
                        throw new InvalidOperationException($"QQ installer failed or was canceled (exit {setup.ExitCode}).");
                }
                finally
                {
                    try { Directory.Delete(temporary, true); }
                    catch (IOException) { say("安装缓存仍在：" + temporary, "Installer cache remains at: " + temporary); }
                }
                exe = FindInstalled() ?? throw new InvalidOperationException("QQ setup exited successfully but QQ was not found. Open QQ manually, then restart Nowluma.");
            }
            else
            {
                Process.Start(new ProcessStartInfo("https://im.qq.com/index/#/windows") { UseShellExecute = true });
                say("装好后打开 QQ；控制台会检测本机 QQ。", "Install and open QQ; the console detects it on this computer.");
            }
        }
        if (exe is not null)
        {
            var processes = Process.GetProcessesByName("QQ");
            bool running = processes.Length != 0;
            foreach (var process in processes) process.Dispose();
            if (!running)
            {
                string answer = choose("QQ 已安装：1. 现在打开  2. 自己打开", "QQ is installed: 1. Open it now  2. Open it yourself", "1");
                if (answer is not ("1" or "2")) throw new InvalidOperationException("Invalid QQ launch choice.");
                if (answer == "1") Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true });
            }
        }
        return true;
    }

    private static async Task VerifySignature(string installer)
    {
        var start = new ProcessStartInfo("powershell.exe")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (string argument in new[] { "-NoProfile", "-NonInteractive", "-Command",
            "$s = Get-AuthenticodeSignature -LiteralPath $env:NOWLUMA_QQ_INSTALLER; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch '(?:^|,\\s*)O=\"?Tencent ') { Write-Error ('QQ signature rejected: ' + $s.Status); exit 1 }" })
            start.ArgumentList.Add(argument);
        start.Environment["NOWLUMA_QQ_INSTALLER"] = installer;
        using var process = Process.Start(start) ?? throw new InvalidOperationException("QQ signature check could not start.");
        var output = process.StandardOutput.ReadToEndAsync();
        var errors = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            throw new InvalidOperationException("QQ signature check timed out; the installer was not started.");
        }
        await output;
        if (process.ExitCode != 0) throw new InvalidOperationException("QQ signature check failed: " + await errors);
    }

    private static async Task Download(string url, string target)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(20));
        using var client = new HttpClient();
        using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        response.EnsureSuccessStatusCode();
        const long limit = 400L * 1024 * 1024;
        if (response.Content.Headers.ContentLength > limit) throw new InvalidOperationException("QQ installer exceeds its size limit.");
        await using var input = await response.Content.ReadAsStreamAsync(timeout.Token);
        await using var output = File.Create(target);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[128 * 1024];
        long size = 0;
        int count;
        while ((count = await input.ReadAsync(buffer, timeout.Token)) > 0)
        {
            size += count;
            if (size > limit) throw new InvalidOperationException("QQ installer exceeds its size limit.");
            hash.AppendData(buffer, 0, count);
            await output.WriteAsync(buffer.AsMemory(0, count), timeout.Token);
        }
        if (Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant() != Sha256) throw new InvalidOperationException("QQ installer checksum mismatch.");
    }
}
