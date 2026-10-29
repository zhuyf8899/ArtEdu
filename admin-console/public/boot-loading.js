      // First visit works immediately; storage failures must never block startup.
      try {
        const style = document.getElementById('local-loading-animation');
        const key = 'artedu-loading-animation-v1';
        const cached = localStorage.getItem(key);
        // Only reuse this version's known CSS, never arbitrary stored content.
        if (cached === style.textContent) style.textContent = cached;
        else localStorage.setItem(key, style.textContent);
      } catch { /* Storage may be disabled. */ }
