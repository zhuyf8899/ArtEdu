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
  const [account, setAccount] = useState(() => TEST_ACCOUNTS.find((item) => item.id === window.localStorage.getItem("artedu-test-user-id")) ?? null);
  const { pathname, navigate } = useAppRoute();

  useEffect(() => { setTestActor(account?.id ?? ""); }, [account]);

  if (!account) return <TestLogin accounts={TEST_ACCOUNTS} onSelect={(nextAccount) => { setAccount(nextAccount); navigate("/"); }} />;
  if (pathname.startsWith("/admin")) return <AdminDashboard actor={account} initialSection={adminSectionFromPath(pathname)} onNavigate={(section) => navigate({ overview: "/admin", users: "/admin/users", reviews: "/admin/reviews" }[section] ?? "/admin")} onBack={() => navigate("/")} />;
  return <UserPortal account={account} section={sectionFromPath(pathname)} onNavigate={navigate} onSwitchAccount={() => { setAccount(null); navigate("/"); }} onEnterAdmin={() => navigate("/admin")} />;
}
