const key = (accountId,toolId) => 'artedu:tool-bookmark:'+accountId+':'+toolId;

export function isToolBookmarked(accountId,toolId) {
  try { return localStorage.getItem(key(accountId,toolId))==='1'; }
  catch { return false; }
}

export function setToolBookmark(accountId,toolId,saved) {
  if(saved)localStorage.setItem(key(accountId,toolId),'1');
  else localStorage.removeItem(key(accountId,toolId));
}

export function hasToolBookmarks(accountId) {
  const prefix=key(accountId,'');
  try { return Object.keys(localStorage).some(key=>key.startsWith(prefix)); }
  catch { return false; }
}
