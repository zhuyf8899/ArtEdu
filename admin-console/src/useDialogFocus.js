import { useEffect } from 'react';
import {lockPageScroll} from './pageScrollLock.js';

export function useDialogFocus(ref, onClose, active=true) {
  useEffect(() => {
    if(!active)return;
    const previous = document.activeElement;
    const root = ref.current;
    const unlock=lockPageScroll();
    const selectors = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]';
    const focusable = () => root ? [...root.querySelectorAll(selectors)].filter(node => node.tabIndex >= 0 && node.getClientRects().length) : [];
    focusable()[0]?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab' || !root) return;
      const nodes = focusable();
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    root?.addEventListener('keydown', keydown);
    return () => { root?.removeEventListener('keydown', keydown); unlock(); previous?.isConnected && previous.focus({preventScroll:true}); };
  }, [ref, onClose, active]);
}
