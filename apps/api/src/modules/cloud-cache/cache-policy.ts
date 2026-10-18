export const CLOUD_CACHE_MS = 20 * 60 * 1000;
export const CLOUD_CACHE_SQL = "INTERVAL '20 minutes'";
export function cacheExpired(createdAt: Date | string | number, now = Date.now()) {
 return now - new Date(createdAt).getTime() >= CLOUD_CACHE_MS;
}
