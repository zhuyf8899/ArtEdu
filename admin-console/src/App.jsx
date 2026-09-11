import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/700.css";
import { lazy, Suspense, useEffect, useState } from "react";
import { LocalLogin, UserPortal } from "./Portal.jsx";
import { FeedbackProvider } from "./FeedbackCenter.jsx";
import { getCurrentUser, loginLocal, logoutLocal } from "./services/adminApi.js";
import { canEnterAdmin } from "./testAccounts.js";
import { adminSectionFromPath, sectionFromPath, useAppRoute } from "./routing.js";

const AdminDashboard = lazy(() => import("./AdminDashboard.jsx").then(({ AdminDashboard: component }) => ({ default: component })));

export function App() {
  return <FeedbackProvider><AppContent /></FeedbackProvider>;
}

function AppContent() {
  const [account, setAccount] = useState(null);
  const [ready, setReady] = useState(false);
  const { pathname, search, navigate } = useAppRoute();

  useEffect(() => {
    getCurrentUser().then((actor) => setAccount(toPortalAccount(actor))).catch(() => setAccount(null)).finally(() => setReady(true));
  }, []);

  const signIn = async (username, password) => {
    const actor = await loginLocal(username, password);
    setAccount(toPortalAccount(actor));
    navigate("/");
  };

  const signOut = async () => {
    try { await logoutLocal(); } finally { setAccount(null); navigate("/"); }
  };

  if (!ready) return <main className="portal-empty"><p>正在验证登录会话…</p></main>;
  if (!account) return <LocalLogin onLogin={signIn} />;
  if (pathname.startsWith("/admin") && !canEnterAdmin(account)) return <main className="portal-empty"><h1>无权访问管理后台</h1><p>请使用已授权的教师、运营或管理员账户登录。</p></main>;
  if (pathname.startsWith("/admin")) return <Suspense fallback={<main className="portal-empty"><p>正在加载管理台…</p></main>}><AdminDashboard actor={account} initialSection={adminSectionFromPath(pathname)} onNavigate={(section) => navigate({ overview: "/admin", users: "/admin/users", courses: "/admin/courses", workflows: "/admin/workflows", reviews: "/admin/reviews", bridges: "/admin/bridges" }[section] ?? "/admin")} onBack={() => navigate("/")} /></Suspense>;
  const query = new URLSearchParams(search);
  return <UserPortal account={account} section={sectionFromPath(pathname)} searchQuery={query.get("query") ?? ""} studioWorkflowId={query.get("workflow") ?? ""} creationStartNew={query.get("new") === "1"} onNavigate={navigate} onSwitchAccount={signOut} onEnterAdmin={() => navigate("/admin")} />;
}

function toPortalAccount(actor) {
  const role = ["admin", "operator", "teacher", "student"].find((value) => actor.roles?.includes(value)) ?? "student";
  const display = { admin: ["平台管理员", "ink"], operator: ["运营审核", "orange"], teacher: ["教师", "lime"], student: ["学生", "purple"] }[role];
  return { id: actor.id, name: actor.displayName, shortName: actor.displayName, role, roles: actor.roles ?? [], roleLabel: display[0], accent: display[1] };
}
