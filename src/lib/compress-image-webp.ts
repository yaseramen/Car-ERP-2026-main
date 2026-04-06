import sharp from "sharp";

/**
 * ضغط موحّد لرفع Blob: WebP مع effort عالٍ لتقليل الحجم مع الحفاظ على مظهر جيد عند العرض.
 * الشعارات: أبعاد أصغر نسبياً + alpha أوضح؛ السوق/اللقطات: أبعاد مناسبة للشاشة.
 */
const WEBP_EFFORT = 6;

export type ImageWebpPreset = "logo" | "marketplace" | "screenshot";

const PRESETS: Record<
  ImageWebpPreset,
  { maxW: number; maxH: number; quality: number; alphaQuality: number }
> = {
  /** شعار: حدّ 512px كالسابق؛ جودة متوسطة + effort عالٍ يقلّل الحجم مع بقاء الحواف واضحة */
  logo: { maxW: 512, maxH: 512, quality: 80, alphaQuality: 92 },
  marketplace: { maxW: 1080, maxH: 1080, quality: 72, alphaQuality: 85 },
  screenshot: { maxW: 1400, maxH: 1400, quality: 72, alphaQuality: 85 },
};

export async function bufferToCompressedWebp(buf: Buffer, preset: ImageWebpPreset): Promise<Buffer> {
  const p = PRESETS[preset];
  return sharp(buf)
    .rotate()
    .resize({
      width: p.maxW,
      height: p.maxH,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: p.quality,
      alphaQuality: p.alphaQuality,
      effort: WEBP_EFFORT,
      smartSubsample: true,
    })
    .toBuffer();
}
