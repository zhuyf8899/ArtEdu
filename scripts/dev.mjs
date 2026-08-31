import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCli = process.env.npm_execpath;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processes = [
  { name: "api", cwd: "apps/api", args: ["run", "dev"] },
  { name: "web", cwd: "admin-console", args: ["run", "dev"] },
  { name: "worker", cwd: "apps/api", args: ["run", "worker"] },
];

const children = processes.map(({ name, cwd, args }) => {
  const command = npmCli ? process.execPath : npmCommand;
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  const child = spawn(command, commandArgs, { cwd: path.join(repositoryRoot, cwd), stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (code && code !== 0) console.error(`[${name}] exited with code ${code}`);
    if (signal) console.error(`[${name}] stopped by ${signal}`);
  });
  return child;
});

function stopAll(signal) {
  for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));
