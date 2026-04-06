export type VolumeDiscountTier = { minTotal: number; percent: number };

/** أعلى نسبة خصم تطبّق: آخر شريحة حيث subtotal >= minTotal (بعد ترتيب الحدود تصاعدياً) */
export function resolveVolumeDiscountPercent(subtotal: number, tiers: VolumeDiscountTier[]): number {
  if (subtotal <= 0 || !tiers?.length) return 0;
  const sorted = [...tiers]
    .map((t) => ({
      minTotal: Math.max(0, Number(t.minTotal) || 0),
      percent: Math.min(100, Math.max(0, Number(t.percent) || 0)),
    }))
    .filter((t) => t.minTotal > 0)
    .sort((a, b) => a.minTotal - b.minTotal);
  let applied = 0;
  for (const t of sorted) {
    if (subtotal + 1e-9 >= t.minTotal) applied = t.percent;
  }
  return Math.min(100, Math.max(0, applied));
}
