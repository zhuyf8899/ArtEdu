// Keep the popover inside the viewport and below the sticky navigation when it opens upward.
export function calculateCapabilityMenuPlacement({ triggerBounds, headerBottom, viewportWidth, viewportHeight, desiredHeight, align = "start" }) {
  const gap = 8;
  const safeTop = Math.max(12, headerBottom + gap);
  const above = Math.max(0, triggerBounds.top - safeTop - gap);
  const below = Math.max(0, viewportHeight - triggerBounds.bottom - 12 - gap);
  const opensAbove = above >= desiredHeight || (above >= Math.min(220, desiredHeight) && below < desiredHeight)
    || (above > below && below < desiredHeight);
  const availableHeight = opensAbove ? above : below;
  const height = Math.min(desiredHeight, availableHeight);
  const width = Math.min(320, viewportWidth - 24);
  const preferredLeft = align === "end" ? triggerBounds.right - width : triggerBounds.left;
  return {
    top: opensAbove ? triggerBounds.top - gap - height : triggerBounds.bottom + gap,
    left: Math.max(12, Math.min(preferredLeft, viewportWidth - width - 12)),
    width,
    maxHeight: availableHeight,
  };
}
