export const portalRoutes = { home: '/', courses: '/learning', studio: '/studio', community: '/community', myLearning: '/my-learning', search: '/search', creation: '/create' };
export const adminRoutes = { overview: '/admin', users: '/admin/users', courses: '/admin/courses', workflows: '/admin/workflows', reviews: '/admin/reviews', reports: '/admin/reports', bridges: '/admin/bridges' };
export const normalizePath = (pathname) => pathname.replace(/\/+$/, '') || '/';
export const sectionFromPath = (pathname) => Object.entries(portalRoutes).find(([,route]) => route === normalizePath(pathname))?.[0] ?? null;
export const adminSectionFromPath = (pathname) => Object.entries(adminRoutes).find(([,route]) => route === normalizePath(pathname))?.[0] ?? null;
export function safeDestination(to, origin) {
  const url = new URL(to, origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('只能打开平台内的页面');
  return normalizePath(url.pathname) + url.search + url.hash;
}
export function studioUrl({ workflow = '', run = '', builder = false, edit = '' } = {}) {
  const params = new URLSearchParams();
  if (builder) { params.set('builder','1'); if (edit) params.set('edit',edit); }
  else { if(workflow) params.set('workflow',workflow); if(run) params.set('run',run); }
  return '/studio' + (params.size ? '?' + params : '');
}
export function canViewAdminSection(account, section) {
  const roles = account.roles ?? [account.role];
  if (roles.includes('admin') || roles.includes('teacher')) return true;
  return roles.includes('operator') && ['reviews','reports'].includes(section);
}
