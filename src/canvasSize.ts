// Low enough to fit real icon sizes (16px being the smallest common one) — see
// PropsPanel.tsx's ICON_SIZE_PRESETS, which this clamp also bounds.
export const MIN_CANVAS_SIZE = 8
export const MAX_CANVAS_SIZE = 4000

export function clampCanvasSize(value: number) {
  if (Number.isNaN(value)) return MIN_CANVAS_SIZE
  return Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, value))
}
