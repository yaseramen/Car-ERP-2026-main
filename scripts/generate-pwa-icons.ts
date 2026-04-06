/**
 * تحويل الشعار إلى أيقونات PNG و favicon (PWA + استعداد لـ Play / TWA)
 *
 * الشكل الافتراضي للتطبيق والموقع:
 *   - public/icon.png (مربّع، يُفضّل 1024×1024، خلفية شفافة أو لون موحّد)
 *   - أو public/icon.svg إن لم يوجد PNG
 *
 * شكل بديل (للمقارنة أو لبناء APK بشعار آخر):
 *   - public/icon-variant.png → يُنشئ icon-variant-192.png و icon-variant-512.png
 *   لاستخدام البديل كأيقونة رسمية: انسخ الملفين إلى icon-192.png و icon-512.png
 *   أو عيّن الشكل المختار كـ icon.png وأعد تشغيل السكربت.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import sharp from "sharp";

async function generateSet(inputBuffer: Buffer, publicDir: string, baseName: string) {
  const sizes = [192, 512] as const;
  for (const size of sizes) {
    const pngBuffer = await sharp(inputBuffer).resize(size, size).png().toBuffer();
    const outPath = join(publicDir, `${baseName}-${size}.png`);
    writeFileSync(outPath, pngBuffer);
    console.log(`تم إنشاء ${outPath}`);
  }
}

async function main() {
  try {
    const publicDir = join(process.cwd(), "public");
    const appDir = join(process.cwd(), "src", "app");

    const pngSource = join(publicDir, "icon.png");
    const svgSource = join(publicDir, "icon.svg");
    const sourcePath = existsSync(pngSource) ? pngSource : existsSync(svgSource) ? svgSource : null;

    if (!sourcePath) {
      console.warn("scripts/generate-pwa-icons: لا يوجد icon.png ولا icon.svg في public/");
      return;
    }

    const inputBuffer = readFileSync(sourcePath);
    await generateSet(inputBuffer, publicDir, "icon");

    const variantPath = join(publicDir, "icon-variant.png");
    if (existsSync(variantPath)) {
      await generateSet(readFileSync(variantPath), publicDir, "icon-variant");
      console.log(
        "تم توليد icon-variant-192/512 — للاعتماد عليها: انسخها إلى icon-192.png و icon-512.png أو استبدل icon.png وأعد التشغيل."
      );
    }

    const icon192 = join(publicDir, "icon-192.png");
    const appIcon = join(appDir, "icon.png");
    if (existsSync(icon192) && existsSync(appDir)) {
      writeFileSync(appIcon, readFileSync(icon192));
      console.log("تم تحديث app/icon.png (أيقونة التبويب)");
    }
  } catch (err) {
    console.warn("scripts/generate-pwa-icons: فشل التحويل:", err);
  }
}

main();
