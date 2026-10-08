/**
 * 【应用总入口】恢复用户会话，然后按登录状态、地址和角色选择界面。阅读顺序：App → AppContent 的状态与 useEffect → signIn/signOut → return 分支 → toPortalAccount。前端分流用于交互，业务权限还会由后端检查。
 */

import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/600.css";
import "@fontsource/noto-sans-sc/700.css";
import { lazy, Suspense, useEffect, useState } from "react";
import { LocalLogin, UserPortal } from "./Portal.jsx";
import { useResourceNavigation } from "./useResourceNavigation.js";
import { SESSION_EXPIRED } from "./services/httpFeedback.js";
import { canViewAdminSection, adminRoutes } from "./navigationModel.js";
import { FeedbackProvider, useFeedback } from "./FeedbackCenter.jsx";
import { getCurrentUser, loginLocal, logoutLocal } from "./services/adminApi.js";
import { canEnterAdmin } from "./testAccounts.js";
import { adminSectionFromPath, sectionFromPath, useAppRoute } from "./routing.js";

// lazy 延迟加载较大的页面：进入对应页面时才下载；Suspense 显示等待界面。
const AdminDashboard = lazy(() => import("./AdminDashboard.jsx").then(({ AdminDashboard: component }) => ({ default: component })));
const ImageCanvas = lazy(() => import("./ImageCanvas.jsx").then(({ ImageCanvas: component }) => ({ default: component })));

export function App() {
  // Provider 为内部页面提供统一的操作提示、确认等反馈能力。
  return <FeedbackProvider><AppContent /></FeedbackProvider>;
}

function AppContent() {
  // useState 返回 [当前值, 修改函数]；修改状态会让 React 重新计算界面。
  // account 为 null 表示还没有用户信息；ready 区分“查询中”和“查询结束”。
  const [account, setAccount] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const { notify } = useFeedback();
  useResourceNavigation(notify);
  const { pathname, search, navigate } = useAppRoute();

  // 挂载后询问后端当前身份。then 处理成功，catch 处理失败，finally 总会执行。
  // 末尾 [] 表示此 Effect 不随状态变化重跑；开发 StrictMode 可额外检查它。
  useEffect(() => {
    getCurrentUser().then((actor) => setAccount(toPortalAccount(actor))).catch(() => setAccount(null)).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const expired = () => { setAccount(null); setSessionMessage('登录已失效，请重新登录，随后继续当前页面。'); };
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, []);
  const adminSection = adminSectionFromPath(pathname);
  useEffect(() => {
    if(account?.role === 'operator' && pathname === '/admin') navigate('/admin/reviews', { replace: true });
  }, [account, pathname, navigate]);

  // 登录后保留当前路径及课程、工作流等参数。
  const signIn = async (username, password) => {
    const actor = await loginLocal(username, password);
    setAccount(toPortalAccount(actor));
    setSessionMessage("");
  };

  // 即使登出请求失败，也先清除前端显示状态；服务端会话是否撤销取决于请求结果。
  const signOut = async () => {
    try { await logoutLocal(); }
    catch(error) { if(error.status !== 401) { notify('退出失败，当前会话仍保留，请重试。' + error.message, 'error'); return; } }
    setAccount(null); setSessionMessage(''); navigate('/');
  };

  // 按顺序选择一个界面；return 后本轮不会继续判断后面的分支。
  // ! 表示“非”：未查完先等待，没有用户就显示登录页。
  if (!ready) return <main className="portal-empty"><p>正在验证登录会话…</p></main>;
  if (!account) return <LocalLogin onLogin={signIn} message={sessionMessage} />;
  if (pathname === "/canvas") return <Suspense fallback={<main className="portal-empty"><p>正在打开图片画布…</p></main>}><ImageCanvas onBack={() => navigate("/studio")} /></Suspense>;
  if (!sectionFromPath(pathname) && !adminSection) return <main className="portal-empty"><h1>页面不存在</h1><p>链接可能已失效，请返回首页选择入口。</p><button onClick={() => navigate('/')}>返回首页</button></main>;
  if (adminSection && (!canEnterAdmin(account) || !canViewAdminSection(account, adminSection))) return <main className="portal-empty"><h1>无权访问此管理页面</h1><p>当前账号没有访问权限，可返回学习空间或切换账号。</p><button onClick={() => navigate('/')}>返回学习空间</button><button onClick={signOut}>退出并切换账号</button></main>;
  if (adminSection) return <Suspense fallback={<main className="portal-empty"><p>正在加载管理台…</p></main>}><AdminDashboard actor={account} initialSection={adminSection} workflowEditId={new URLSearchParams(search).get('edit') ?? ''} onWorkflowNavigate={(id) => navigate('/admin/workflows' + (id ? '?edit=' + encodeURIComponent(id) : ''))} onNavigate={(section) => navigate(adminRoutes[section] ?? '/admin')} onBack={() => navigate('/')} /></Suspense>;
  // 普通门户页面根据路径选择栏目；?course=... 等参数用于定位课程、课时或对话。
  // 传给组件的这些字段叫 props：由父组件向子组件提供数据和回调函数。
  const query = new URLSearchParams(search);
  return <UserPortal account={account} section={sectionFromPath(pathname)} searchQuery={query.get("query") ?? ""} learningCourseId={query.get("course") ?? ""} learningLessonId={query.get("lesson") ?? ""} learningAtlas={query.get("atlas") ?? ""} learningAtlasCourse={query.get("atlasCourse") ?? ""} studioWorkflowId={query.get("workflow") ?? ""} studioRunId={query.get("run") ?? ""} studioBuilder={query.get("builder") === "1"} studioEditId={query.get("edit") ?? ""} creationStartNew={query.get("new") === "1"} creationId={query.get("id") ?? ""} onNavigate={navigate} onSwitchAccount={signOut} onEnterAdmin={() => navigate("/admin")} />;
}

function toPortalAccount(actor) {
  // 一个用户可有多个角色；此处按优先级选择显示角色，同时保留完整 roles。
  // ?. 避免缺少字段时报错；?? 在左侧为 null/undefined 时使用右侧默认值。
  const role = ["admin", "operator", "teacher", "student"].find((value) => actor.roles?.includes(value)) ?? "student";
  const display = { admin: ["平台管理员", "ink"], operator: ["运营审核", "orange"], teacher: ["教师", "lime"], student: ["学生", "purple"] }[role];
  return { id: actor.id, name: actor.displayName, shortName: actor.displayName, role, roles: actor.roles ?? [], roleLabel: display[0], accent: display[1] };
}
