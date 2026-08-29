import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const processes = [
  { name: "api", cwd: "apps/api", args: ["run", "dev"] },
  { name: "web", cwd: "admin-console", args: ["run", "dev"] },
  { name: "worker", cwd: "apps/api", args: ["run", "worker"] },
];

const children = processes.map(({ name, cwd, args }) => {
  const child = spawn(npmCommand, args, { cwd, stdio: "inherit" });
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
