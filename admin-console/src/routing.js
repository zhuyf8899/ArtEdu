import { useCallback, useEffect, useState } from "react";

export const portalRoutes = {
  home: "/",
  courses: "/learning",
  studio: "/studio",
  community: "/community",
  myLearning: "/my-learning",
  search: "/search",
};

export const adminRoutes = {
  overview: "/admin",
  users: "/admin/users",
  courses: "/admin/courses",
  workflows: "/admin/workflows",
  reviews: "/admin/reviews",
};

export function normalizePath(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function sectionFromPath(pathname) {
  const path = normalizePath(pathname);
  return Object.entries(portalRoutes).find(([, route]) => route === path)?.[0] ?? "home";
}

export function adminSectionFromPath(pathname) {
  const path = normalizePath(pathname);
  return Object.entries(adminRoutes).find(([, route]) => route === path)?.[0] ?? "overview";
}

export function useAppRoute() {
  const [location, setLocation] = useState(() => ({ pathname: normalizePath(window.location.pathname), search: window.location.search }));

  useEffect(() => {
    const updatePath = () => setLocation({ pathname: normalizePath(window.location.pathname), search: window.location.search });
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  const navigate = useCallback((to) => {
    const nextUrl = new URL(to, window.location.origin);
    const nextPath = normalizePath(nextUrl.pathname);
    if (`${nextPath}${nextUrl.search}` === `${window.location.pathname}${window.location.search}`) return;
    window.history.pushState({}, "", `${nextPath}${nextUrl.search}`);
    setLocation({ pathname: nextPath, search: nextUrl.search });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  return { ...location, navigate };
}
