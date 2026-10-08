export const SESSION_EXPIRED = 'artedu:session-expired';
export function responseError(status, data, endpoint = '') {
  const message = Array.isArray(data?.message) ? data.message.join('；') : data?.message;
  let text = message || (status === 403 ? '当前账号没有执行此操作的权限' : status === 404 ? '内容不存在或已下架，请返回列表查看其他内容' : status === 429 ? '请求过于频繁，请稍后重试' : '请求失败（HTTP ' + status + '）');
  if (status === 401 && !/\/auth\/(login|me|logout)(?:[?]|$)/.test(endpoint)) {
    text = '登录状态已失效，请重新登录后继续';
    if(typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED));
  }
  if(status === 403 && message === '跨站写请求被拒绝') text = '当前访问地址未获服务器授权，请联系管理员配置此地址后重试';
  return Object.assign(new Error(text), {status});
}
