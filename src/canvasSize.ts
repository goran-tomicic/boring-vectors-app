export const MIN_CANVAS_SIZE = 100
export const MAX_CANVAS_SIZE = 4000

export function clampCanvasSize(value: number) {
  if (Number.isNaN(value)) return MIN_CANVAS_SIZE
  return Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, value))
}
