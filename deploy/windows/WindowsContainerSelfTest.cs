using System.Text.Json;

internal static class WindowsContainerSelfTest
{
    internal static async Task Run(string root)
    {
        string fixture = Path.Combine(root, ".docker-fixture-" + Guid.NewGuid().ToString("N"));
        string directory = Path.Combine(fixture, "container");
        string oldPath = Environment.GetEnvironmentVariable("PATH") ?? "";
        string oldDirectory = Environment.CurrentDirectory;
        Directory.CreateDirectory(directory);
        try
        {
            File.Copy(Path.Combine(root, "node.exe"), Path.Combine(fixture, "docker.exe"));
            File.WriteAllText(Path.Combine(fixture, "info"), "import fs from 'node:fs'; fs.writeFileSync('info-called', 'fixture'); console.log('linux');");
            File.WriteAllText(Path.Combine(directory, "compose"), """
                import fs from 'node:fs';
                const args = process.argv.slice(2);
                const command = args[2];
                if (!['up', 'logs', 'restart', 'stop'].includes(command)) throw Error('Unexpected Docker command');
                fs.appendFileSync('commands.jsonl', JSON.stringify({ command, image: process.env.NOWLUMA_IMAGE }) + '\n');
                console.log('FIXTURE Docker ' + command);
                if (process.env.NOWLUMA_IMAGE === 'fixture/fail:1') process.exit(23);
                """);
            Environment.CurrentDirectory = fixture;
            Environment.SetEnvironmentVariable("PATH", fixture + Path.PathSeparator + oldPath);
            if (!WindowsContainer.Available() || !File.Exists(Path.Combine(fixture, "info-called")))
                throw new InvalidOperationException("Fake Docker was not selected; no container commands were run.");
            var choices = new Queue<string>(new[] { "fixture/local:1", "2", "3", "4", "5", "1", "0" });
            int opened = 0;
            await WindowsContainer.Run(fixture, endpoint =>
            {
                if (endpoint != "http://127.0.0.1:5099/") throw new InvalidOperationException("Unexpected Docker endpoint.");
                opened++;
            }, (_, _, _) => choices.Dequeue(), (_, en) => Console.WriteLine(en));
            var commands = File.ReadAllLines(Path.Combine(directory, "commands.jsonl")).Select(line =>
            {
                using var json = JsonDocument.Parse(line);
                if (json.RootElement.GetProperty("image").GetString() != "fixture/local:1")
                    throw new InvalidOperationException("Docker image was not retained.");
                return json.RootElement.GetProperty("command").GetString();
            });
            if (!commands.SequenceEqual(new[] { "up", "logs", "logs", "restart", "up", "stop", "up" }) || choices.Count != 0 || opened != 2 ||
                File.ReadAllText(Path.Combine(directory, ".image")) != "fixture/local:1")
                throw new InvalidOperationException("Docker terminal management check failed.");
            string keep = Path.Combine(directory, "keep-fixture-data");
            File.WriteAllText(keep, "unchanged");
            try
            {
                await WindowsContainer.Run(fixture, _ => throw new Exception("Failed Docker opened the console."), (_, _, _) => "fixture/fail:1", (_, _) => { });
                throw new Exception("Failed Docker command was accepted.");
            }
            catch (InvalidOperationException error) when (error.Message.Contains("exit 23")) { }
            if (File.ReadAllText(keep) != "unchanged") throw new InvalidOperationException("Docker failure removed fixture data.");
            File.WriteAllText(Path.Combine(fixture, "info"), "console.log('windows');");
            if (WindowsContainer.Available()) throw new InvalidOperationException("A Windows Docker engine was accepted.");
            Console.WriteLine("PASS: actual Docker terminal choices, image retention, Linux gate and failed command (fake Docker only)");
        }
        finally
        {
            Environment.CurrentDirectory = oldDirectory;
            Environment.SetEnvironmentVariable("PATH", oldPath);
            Directory.Delete(fixture, true);
        }
    }
}
