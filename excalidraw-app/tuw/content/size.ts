/** Reduce (nunca agranda) un tamaño para que su lado mayor no pase de `maxSide`. */
export const fitSize = (
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } => {
  if (!(width > 0) || !(height > 0)) {
    return { width: maxSide, height: maxSide };
  }
  const k = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  };
};
