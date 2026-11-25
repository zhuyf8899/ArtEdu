const KEY = 'morph-display-quality';
const profiles = {
  light: { fps: 0, dpr: 1, scale: .16 },
  economy: { fps: 18, dpr: 1, scale: .22 },
  balanced: { fps: 30, dpr: 1.25, scale: .42 },
  high: { fps: 60, dpr: 1.65, scale: 1 },
};
const automaticTiers = ['economy', 'balanced', 'high'];
let sessionMode;
export function getQualityMode() { if (sessionMode) return sessionMode; try { return ['auto','light','balanced','high'].includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'auto'; } catch { return 'auto'; } }
export function initialTier(device = {}) {
  if ((device.hardwareConcurrency && device.hardwareConcurrency <= 4) || (device.deviceMemory && device.deviceMemory <= 4)) return 'economy';
  return device.hardwareConcurrency >= 12 && device.deviceMemory >= 8 ? 'high' : 'balanced';
}
export function qualityProfile(automaticTier = initialTier(navigator)) {
  const mode = getQualityMode();
  const tier = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'light' : mode === 'auto' ? automaticTier : mode;
  return { tier, ...profiles[tier] };
}
export function setQualityMode(mode) {
  if (!['auto','light','balanced','high'].includes(mode)) return;
  sessionMode = mode;
  try { localStorage.setItem(KEY,mode); } catch { /* Session selection still works through the event. */ }
  window.dispatchEvent(new Event('morph-quality-change'));
}
export function mountQuality(root, mount) {
  const ceiling = automaticTiers.indexOf(initialTier(navigator));
  let tierIndex = ceiling;
  let recoverAfter = 0;
  let generation = 0;
  let cleanup;
  const refresh = () => {
    const current = ++generation;
    cleanup?.();
    const profile = qualityProfile(automaticTiers[tierIndex]);
    root.dataset.displayQuality = profile.tier;
    const reportFrame = frameBudget(profile, direction => {
      const next = Math.min(ceiling, Math.max(0, tierIndex + direction));
      if (next === tierIndex || (direction > 0 && performance.now() < recoverAfter)) return;
      queueMicrotask(() => {
        if (generation !== current || getQualityMode() !== 'auto' || document.hidden) return;
        tierIndex = next;
        if (direction < 0) recoverAfter = performance.now() + 30000;
        refresh();
      });
    });
    cleanup = mount(root, profile, reportFrame);
  };
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  window.addEventListener('morph-quality-change',refresh);
  motion.addEventListener('change',refresh);
  refresh();
  return () => { generation++; cleanup?.(); window.removeEventListener('morph-quality-change',refresh); motion.removeEventListener('change',refresh); };
}
// Canvas commands can complete before rasterization, so track frame cadence as well as draw time.
export function frameBudget(profile, changeTier) {
  const budget = 1000 / profile.fps;
  let elapsed = 0, samples = 0, slow = 0, smooth = 0, stableWindows = 0;
  return (duration, interval) => {
    if (getQualityMode() !== 'auto' || document.hidden || !profile.fps) return;
    if (!interval) {
      elapsed = samples = slow = smooth = stableWindows = 0;
      return;
    }
    elapsed += interval;
    samples++;
    if (duration > budget * .8 || interval > budget * 1.55) slow++;
    if (duration < budget * .45 && interval < budget * 1.3) smooth++;
    if (elapsed < 1500 || samples < 12) return;
    if (slow > samples / 2) {
      stableWindows = 0;
      changeTier(-1);
    } else {
      stableWindows = smooth >= samples * .9 ? stableWindows + 1 : 0;
      if (stableWindows >= 4) changeTier(1);
    }
    elapsed = samples = slow = smooth = 0;
  };
}
