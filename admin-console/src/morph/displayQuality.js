const KEY = 'morph-display-quality';
let sessionMode;
export function getQualityMode() { if (sessionMode) return sessionMode; try { return ['auto','light','balanced','high'].includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'auto'; } catch { return 'auto'; } }
let automatic;
export function initialTier(device = {}) {
  if ((device.hardwareConcurrency && device.hardwareConcurrency <= 4) || (device.deviceMemory && device.deviceMemory <= 4)) return 'light';
  return device.hardwareConcurrency >= 12 && device.deviceMemory >= 8 ? 'high' : 'balanced';
}
export function qualityProfile() {
  const mode = getQualityMode();
  const tier = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'light' : mode === 'auto' ? (automatic ||= initialTier(navigator)) : mode;
  return { tier, ...({light:{fps:0,dpr:1,scale:.16},balanced:{fps:30,dpr:1.25,scale:.42},high:{fps:60,dpr:1.65,scale:1}}[tier]) };
}
export function setQualityMode(mode) {
  if (!['auto','light','balanced','high'].includes(mode)) return;
  sessionMode = mode;
  try { localStorage.setItem(KEY,mode); } catch { /* Session selection still works through the event. */ }
  window.dispatchEvent(new Event('morph-quality-change'));
}
export function mountQuality(root, mount) {
  let cleanup;
  const refresh = () => { cleanup?.(); const profile = qualityProfile(); root.dataset.displayQuality = profile.tier; cleanup = mount(root, profile); };
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  window.addEventListener('morph-quality-change',refresh);
  motion.addEventListener('change',refresh);
  refresh();
  return () => { cleanup?.(); window.removeEventListener('morph-quality-change',refresh); motion.removeEventListener('change',refresh); };
}
// Measure only active rendered frames; require sustained overload before reducing quality.
export function frameBudget(profile) {
  let samples = 0, slow = 0, work = 0;
  return duration => {
    if (getQualityMode() !== 'auto' || document.hidden || !profile.fps) return;
    samples++; work += duration; if (duration > 1000 / profile.fps * .8) slow++;
    if (samples < 15 || (samples < 90 && work < 2000)) return;
    if (slow > samples / 2 && profile.tier !== 'light') {
      automatic = profile.tier === 'high' ? 'balanced' : 'light';
      setTimeout(() => window.dispatchEvent(new Event('morph-quality-change')),0);
    }
    samples = slow = work = 0;
  };
}
