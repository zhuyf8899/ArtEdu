import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCli = process.env.npm_execpath;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Fail before launching application processes if Docker or the database is unavailable.
try {
  execFileSync(process.execPath, [path.join(repositoryRoot, "scripts/database.mjs"), "up"], { cwd: repositoryRoot, stdio: "inherit", windowsHide: true });
  if (!npmCli) throw new Error("请通过 npm run dev 启动项目");
  execFileSync(process.execPath, [npmCli, "run", "db:migrate"], { cwd: repositoryRoot, stdio: "inherit", windowsHide: true });
} catch {
  console.error("[dev] 数据库预检查失败；修复上方错误后重新执行 npm run dev。");
  process.exit(1);
}
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
