using System.Diagnostics;
using System.Reflection;

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
            if (!process.WaitForExit(3000)) { process.Kill(entireProcessTree: true); return false; }
            if (!Task.WaitAll(new Task[] { output, errors }, 1000)) return false;
            return process.ExitCode == 0 && output.Result.Trim() == "linux";
        }
        catch (System.ComponentModel.Win32Exception) { return false; }
    }

    internal static async Task<int> Run(string root, Action<string> openConsole, Func<string, string, string, string> choose, Action<string, string> say)
    {
        say("此模式复用已有 Docker；Windows 的 WSL/虚拟化层占用因电脑而异，不保证与 Linux 相同。", "This mode reuses Docker. Windows WSL/VM overhead varies; it is not the same as Linux.");
        string directory = Path.Combine(root, "container");
        Program.RejectLinks(directory);
        Directory.CreateDirectory(directory);
        string imageFile = Path.Combine(directory, ".image");
        string compose = Path.Combine(directory, "compose.yml");
        Program.RejectLinks(imageFile);
        Program.RejectLinks(compose);
        string previousImage = File.Exists(imageFile) ? File.ReadAllText(imageFile) : $"ghcr.io/wsxyt/nowluma:{PayloadInfo.Version}";
        string image = choose("镜像地址（发布后可用默认值；也可填写已构建的本地镜像）：", "Image (use the published default, or an existing local image):", previousImage);
        if (image.Length == 0 || image.Any(char.IsWhiteSpace) || image.StartsWith('-')) throw new InvalidOperationException("Invalid Docker image.");
        File.WriteAllText(imageFile, image);
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Nowluma.WindowsCompose")!)
        using (var file = File.Create(compose)) stream.CopyTo(file);
        await Command(directory, compose, image, "up", "-d", "--wait", "--wait-timeout", "240");
        await Command(directory, compose, image, "logs", "--tail", "200", "nowluma");
        openConsole("http://127.0.0.1:5099/");
        say("首次密码见容器日志。浏览器桌面使用控制台会话，无需另行输入 VNC 密码。", "Find the initial password in the container logs. The browser desktop uses your console session; no separate VNC password input is needed.");
        say("关闭窗口或退出不会停止容器；停止、重启均保留数据卷。管理目录：" + directory, "Closing this window or exiting leaves the container running; stop/restart preserve volumes. Management directory: " + directory);
        while (true)
        {
            string answer = choose("1. 打开控制台  2. 查看日志  3. 重启  4. 停止  5. 启动  0. 退出（不停止容器）", "1. Open console  2. Show logs  3. Restart  4. Stop  5. Start  0. Exit (leave container running)", "0");
            switch (answer)
            {
                case "0": return 0;
                case "1": openConsole("http://127.0.0.1:5099/"); break;
                case "2": await Command(directory, compose, image, "logs", "--tail", "200", "nowluma"); break;
                case "3":
                    await Command(directory, compose, image, "restart", "nowluma");
                    await Command(directory, compose, image, "up", "-d", "--wait", "--wait-timeout", "240");
                    break;
                case "4": await Command(directory, compose, image, "stop", "nowluma"); break;
                case "5": await Command(directory, compose, image, "up", "-d", "--wait", "--wait-timeout", "240"); break;
                default: say("无效选项。", "Invalid choice."); break;
            }
        }
    }

    private static async Task Command(string directory, string compose, string image, params string[] arguments)
    {
        var start = new ProcessStartInfo("docker") { WorkingDirectory = directory, UseShellExecute = false };
        foreach (string argument in new[] { "compose", "-f", compose }.Concat(arguments)) start.ArgumentList.Add(argument);
        start.Environment["NOWLUMA_IMAGE"] = image;
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Docker could not start.");
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(5));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            throw new InvalidOperationException("Docker command timed out; inspect the existing container before retrying. Its data volumes were not removed.");
        }
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"Docker {arguments[0]} failed (exit {process.ExitCode}); check the output above. Its data volumes were not removed.");
    }
}
