import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireApi = createRequire(path.join(root, "apps/api/package.json"));
const dotenv = requireApi("dotenv");
const { Pool } = requireApi("pg");
const mode = process.argv[2] ?? "up";

function findDocker() {
  const candidates = [process.env.ARTEDU_DOCKER_PATH, "docker"];
  if (process.platform === "win32") {
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe"));
    if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, "Docker/Docker/resources/bin/docker.exe"));
  }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore", timeout: 10000, windowsHide: true });
      return candidate;
    } catch { /* Try the next standard install location. */ }
  }
  throw new Error("未找到 Docker CLI。请安装 Docker Desktop，或设置 ARTEDU_DOCKER_PATH 为 docker.exe 的完整路径。");
}

function dockerReady(docker) {
  try {
    execFileSync(docker, ["info", "--format", "{{.ServerVersion}}"], { stdio: "ignore", timeout: 5000, windowsHide: true });
    return true;
  } catch { return false; }
}

async function ensureEngine(docker) {
  if (dockerReady(docker)) return;
  if (mode === "check") throw new Error("Docker 引擎尚未就绪。请执行 npm run db:up。");
  if (process.platform !== "win32") throw new Error("Docker 引擎尚未就绪，请启动 Docker Desktop 或 Docker 服务后重试。");
  const desktop = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/Docker Desktop.exe"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Docker/Docker/Docker Desktop.exe"),
  ].filter(Boolean).find((candidate) => existsSync(candidate));
  if (!desktop) throw new Error("未找到 Docker Desktop，请先启动已安装的 Docker 服务。");
  // Process-scoped script permission; does not change the user's execution policy.
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts/prepare-docker-runtime.ps1"), ...(mode === "repair" ? ["-RecoverFailedBackend"] : [])], {
    cwd: root, stdio: "inherit", windowsHide: true, timeout: 30000,
  });
  console.log("[database] 正在启动 Docker Desktop，最多等待 120 秒…");
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Start-Process -FilePath $env:ARTEDU_DESKTOP_EXECUTABLE -WindowStyle Hidden"], {
    stdio: "ignore", windowsHide: true, env: { ...process.env, ARTEDU_DESKTOP_EXECUTABLE: desktop },
  });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Docker Desktop 启动失败")));
  });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (dockerReady(docker)) return;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Docker 启动超时。检查 Docker Desktop 错误窗口和 WSL 状态；套接字错误可执行 npm run db:repair，详情见 docs/docker-startup.md。未启动 API，也未修改数据卷。");
}

function readDatabaseConfig() {
  const apiEnv = dotenv.config({ path: path.join(root, "apps/api/.env"), processEnv: {} }).parsed ?? {};
  const composeEnv = dotenv.config({ path: path.join(root, ".env"), processEnv: {} }).parsed ?? {};
  const connectionString = process.env.DATABASE_URL ?? apiEnv.DATABASE_URL;
  if (!connectionString) throw new Error("缺少 apps/api/.env 中的 DATABASE_URL，请先按 README 配置本地环境。");
  const url = new URL(connectionString);
  const composePort = Number(process.env.ARTEDU_POSTGRES_PORT ?? composeEnv.ARTEDU_POSTGRES_PORT ?? 5432);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("该命令仅管理本地 Compose 数据库；当前 DATABASE_URL 非本机地址，请单独管理外部数据库。");
  if (Number(url.port || 5432) !== composePort) throw new Error(`数据库端口不一致：API 使用 ${url.port || 5432}，Compose 使用 ${composePort}。请同步 apps/api/.env 与根目录 .env 的 ARTEDU_POSTGRES_PORT。`);
  return connectionString;
}

async function checkConnection(connectionString) {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  try {
    await pool.query("SELECT 1");
    console.log("[database] PostgreSQL 健康检查及 API 数据库账号连接通过。");
  } catch {
    throw new Error("PostgreSQL 连接失败：请核对 API 数据库账号、数据库名及端口。为保护凭据，未输出连接字符串。");
  } finally { await pool.end(); }
}

async function main() {
  if (!["up", "check", "down", "repair"].includes(mode)) throw new Error(`未知操作：${mode}`);
  const connectionString = mode === "down" ? undefined : readDatabaseConfig();
  const docker = findDocker();
  // A child-only PATH also lets Docker locate credential helpers in per-user installs.
  const env = { ...process.env, PATH: `${path.dirname(docker)}${path.delimiter}${process.env.PATH ?? ""}` };
  if (mode === "down") {
    execFileSync(docker, ["compose", "stop", "postgres"], { cwd: root, env, stdio: "inherit", timeout: 60000, windowsHide: true });
    return;
  }
  await ensureEngine(docker);
  if (mode === "up" || mode === "repair") {
    execFileSync(docker, ["compose", "up", "-d", "--wait", "--wait-timeout", "90", "postgres"], { cwd: root, env, stdio: "inherit", timeout: 180000, windowsHide: true });
  }
  await checkConnection(connectionString);
}

main().catch((error) => {
  console.error(`[database] ${error.message}`);
  process.exitCode = 1;
});
