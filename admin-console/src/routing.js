import { useCallback, useEffect, useState } from "react";

export const portalRoutes = {
  home: "/",
  courses: "/learning",
  studio: "/studio",
  community: "/community",
  myLearning: "/my-learning",
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
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const updatePath = () => setPathname(normalizePath(window.location.pathname));
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  const navigate = useCallback((to) => {
    const nextPath = normalizePath(to);
    if (nextPath === window.location.pathname) return;
    window.history.pushState({}, "", nextPath);
    setPathname(nextPath);
  }, []);

  return { pathname, navigate };
}
