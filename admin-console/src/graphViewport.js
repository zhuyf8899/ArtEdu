// Shared, bounded viewport math. Browsing a diagram never changes learning records.
export function graphZoom(value) {
  return Math.max(.25, Math.min(1.5, Number.isFinite(value) ? value : 1));
}

export function graphCenter(node, scale, viewport) {
  return {
    left: Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, node.x * scale - viewport.clientWidth / 2)),
    top: Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, node.y * scale - viewport.clientHeight / 2)),
    behavior: "auto",
  };
}
