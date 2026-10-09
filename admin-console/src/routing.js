/**
 * 【路由导读】路由就是网页地址与页面名称的对应关系。本项目通过浏览器 History API 切换地址，再用 React 状态更新页面。pathname 是路径，search 是问号后面的参数；这里没有使用 React Router。
 */
import { useCallback, useEffect, useState } from "react";

import { normalizePath, safeDestination } from './navigationModel.js';
export { portalRoutes, adminRoutes, normalizePath, sectionFromPath, adminSectionFromPath } from './navigationModel.js';

export function useAppRoute() {
  // use 开头的函数是自定义 Hook：把地址状态和导航行为封装给 App 使用。
  const [location, setLocation] = useState(() => ({ pathname: normalizePath(window.location.pathname), search: window.location.search }));

  useEffect(() => {
    // 浏览器前进/后退触发 popstate；离开组件时移除监听，避免重复订阅。
    const updatePath = () => setLocation({ pathname: normalizePath(window.location.pathname), search: window.location.search });
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const nextUrl = new URL(safeDestination(to, window.location.origin), window.location.origin);
    const nextPath = normalizePath(nextUrl.pathname);
    if (`${nextPath}${nextUrl.search}` === `${window.location.pathname}${window.location.search}`) return;
    // pushState 改地址但不刷新整页，也不触发 popstate，所以还要手动更新状态。
    window.history[replace ? "replaceState" : "pushState"]({}, "", `${nextPath}${nextUrl.search}${nextUrl.hash}`);
    setLocation({ pathname: nextPath, search: nextUrl.search });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  return { ...location, navigate };
}
