import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/700.css";
import { useEffect, useState } from "react";
import { AdminDashboard } from "./AdminDashboard.jsx";
import { TestLogin, UserPortal } from "./Portal.jsx";
import { setTestActor } from "./services/adminApi.js";
import { TEST_ACCOUNTS } from "./testAccounts.js";
import { adminSectionFromPath, sectionFromPath, useAppRoute } from "./routing.js";

export function App() {
  const demoAuthEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_AUTH === "true";
  const [account, setAccount] = useState(() => demoAuthEnabled ? TEST_ACCOUNTS.find((item) => item.id === window.localStorage.getItem("artedu-test-user-id")) ?? null : null);
  const { pathname, navigate } = useAppRoute();

  useEffect(() => { setTestActor(account?.id ?? ""); }, [account]);

  if (!account) return demoAuthEnabled
    ? <TestLogin accounts={TEST_ACCOUNTS} onSelect={(nextAccount) => { setAccount(nextAccount); navigate("/"); }} />
    : <main className="portal-empty"><h1>学校统一登录尚未配置</h1><p>生产环境不会提供本地测试身份。</p></main>;
  if (pathname.startsWith("/admin")) return <AdminDashboard actor={account} initialSection={adminSectionFromPath(pathname)} onNavigate={(section) => navigate({ overview: "/admin", users: "/admin/users", courses: "/admin/courses", reviews: "/admin/reviews" }[section] ?? "/admin")} onBack={() => navigate("/")} />;
  return <UserPortal account={account} section={sectionFromPath(pathname)} onNavigate={navigate} onSwitchAccount={() => { setAccount(null); navigate("/"); }} onEnterAdmin={() => navigate("/admin")} />;
}
