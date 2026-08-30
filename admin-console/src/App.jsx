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
  // 演示身份只能在本地开发或显式开启的测试部署中使用；生产构建不得把
  // localStorage 的测试用户当成真实登录身份。
  const demoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_AUTH === "true";
  const [account, setAccount] = useState(() => demoEnabled
    ? TEST_ACCOUNTS.find((item) => item.id === window.localStorage.getItem("artedu-test-user-id")) ?? null
    : null);
  const { pathname, navigate } = useAppRoute();

  useEffect(() => { setTestActor(demoEnabled ? account?.id ?? "" : ""); }, [account, demoEnabled]);

  if (!demoEnabled && !account) return <main className="test-login"><section className="test-login__intro"><div className="test-login__brand"><span>A</span><strong>ArtEdu</strong></div><h1>学校统一登录尚未配置。</h1><p>生产环境必须接入学校 SSO 后才能访问本平台。</p></section></main>;
  if (!account) return <TestLogin accounts={TEST_ACCOUNTS} onSelect={(nextAccount) => { setAccount(nextAccount); navigate("/"); }} />;
  if (pathname.startsWith("/admin")) return <AdminDashboard actor={account} initialSection={adminSectionFromPath(pathname)} onNavigate={(section) => navigate({ overview: "/admin", users: "/admin/users", reviews: "/admin/reviews" }[section] ?? "/admin")} onBack={() => navigate("/")} />;
  return <UserPortal account={account} section={sectionFromPath(pathname)} onNavigate={navigate} onSwitchAccount={() => { setAccount(null); navigate("/"); }} onEnterAdmin={() => navigate("/admin")} />;
}
