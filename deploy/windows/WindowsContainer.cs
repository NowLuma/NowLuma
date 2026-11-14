using System.Diagnostics;
using System.Reflection;
using System.Text;

internal static class WindowsContainer
{
    internal static bool Available()
    {
        try
        {
            var start = new ProcessStartInfo("docker") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (string item in new[] { "info", "--format", "{{.OSType}}" }) start.ArgumentList.Add(item);
            using var process = Process.Start(start)!;
            var output = process.StandardOutput.ReadToEndAsync();
            var errors = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit(3000)) { process.Kill(); return false; }
            return process.ExitCode == 0 && output.GetAwaiter().GetResult().Trim() == "linux";
        }
        catch (System.ComponentModel.Win32Exception) { return false; }
    }

    internal static async Task<int> Run(string root, Action<string> openConsole, Func<string, string, string, string> choose, Action<string, string> say)
    {
        say("此模式复用已有 Docker；Windows 的 WSL/虚拟化层占用因电脑而异，不保证与 Linux 相同。", "This mode reuses Docker. Windows WSL/VM overhead varies; it is not the same as Linux.");
        string image = choose("镜像地址（发布后可用默认值；也可填写已构建的本地镜像）：", "Image (use the published default, or an existing local image):", $"ghcr.io/wsxyt/nowluma:{PayloadInfo.Version}");
        if (image.Length == 0 || image.Any(char.IsWhiteSpace) || image.StartsWith('-')) throw new InvalidOperationException("Invalid Docker image.");
        string directory = Path.Combine(root, "container");
        Directory.CreateDirectory(directory);
        string compose = Path.Combine(directory, "compose.yml");
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Nowluma.WindowsCompose")!)
        using (var file = File.Create(compose)) stream.CopyTo(file);
        var start = new ProcessStartInfo("docker") { WorkingDirectory = directory, UseShellExecute = false };
        foreach (string value in new[] { "compose", "-f", compose, "up", "-d", "--wait", "--wait-timeout", "240" }) start.ArgumentList.Add(value);
        start.Environment["NOWLUMA_IMAGE"] = image;
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Docker could not start.");
        await process.WaitForExitAsync();
        if (process.ExitCode != 0) throw new InvalidOperationException("Docker startup failed; check the output above.");
        say("容器已启动。首次密码可在容器日志中查看，桌面无需额外 VNC 密码。", "Container started. Its logs show the first password; no separate VNC password is needed.");
        var logsStart = new ProcessStartInfo("docker") { WorkingDirectory = directory, UseShellExecute = false, RedirectStandardOutput = true, StandardOutputEncoding = Encoding.UTF8 };
        foreach (string value in new[] { "compose", "-f", compose, "logs", "--tail", "50", "nowluma" }) logsStart.ArgumentList.Add(value);
        logsStart.Environment["NOWLUMA_IMAGE"] = image;
        using var logs = Process.Start(logsStart)!;
        Console.Write(await logs.StandardOutput.ReadToEndAsync());
        await logs.WaitForExitAsync();
        openConsole("http://127.0.0.1:5099/");
        say("关闭此窗口不会停止容器。管理目录：" + directory, "Closing this window leaves the container running. Management directory: " + directory);
        return 0;
    }
}
