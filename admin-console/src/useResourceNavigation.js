import { useEffect } from 'react';
import { responseError } from './services/httpFeedback.js';
// Verify private file links before leaving the learning page; a failed request stays recoverable.
export function useResourceNavigation(notify) {
  useEffect(() => {
    const open = async (event) => {
      const anchor = event.target.closest?.('a[href]');
      if(!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const url = new URL(anchor.href, window.location.origin);
      if(url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return;
      event.preventDefault();
      const preview = anchor.target === '_blank' ? window.open('about:blank', '_blank') : null;
      if(preview) { preview.opener = null; preview.document.title = '正在检查文件访问权限'; preview.document.body.textContent = '正在检查文件访问权限…'; }
      try {
        const response = await fetch(url.href, { method:'HEAD', credentials:'include', redirect:'error' });
        if(!response.ok) throw responseError(response.status, response.status === 403 ? {message:'当前账号无法打开此文件，请确认已加入课程或具有访问权限'} : null, url.pathname);
        if(anchor.target === '_blank' && !preview) throw new Error('浏览器阻止了新窗口，请允许弹窗后重试');
        if(preview) preview.location.replace(url.href); else window.location.assign(url.href);
      } catch(error) { preview?.close(); notify(error.message || '文件暂时无法打开，请稍后重试', 'error'); }
    };
    document.addEventListener('click', open);
    return () => document.removeEventListener('click',open);
  },[notify]);
}
