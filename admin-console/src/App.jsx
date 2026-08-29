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

export function App() {
  const [account, setAccount] = useState(() => TEST_ACCOUNTS.find((item) => item.id === window.localStorage.getItem("artedu-test-user-id")) ?? null);
  const [view, setView] = useState("portal");

  useEffect(() => { setTestActor(account?.id ?? ""); }, [account]);

  if (!account) return <TestLogin accounts={TEST_ACCOUNTS} onSelect={setAccount} />;
  if (view === "admin") return <AdminDashboard actor={account} onBack={() => setView("portal")} />;
  return <UserPortal account={account} onSwitchAccount={() => { setAccount(null); setView("portal"); }} onEnterAdmin={() => setView("admin")} />;
}
