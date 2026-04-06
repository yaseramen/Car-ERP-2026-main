TWA / Android App Bundle (Bubblewrap) — إعداد أسرار GitHub
============================================================

1) أنشئ keystore (مرة واحدة — على أي جهاز فيه Java):
   keytool -genkeypair -v -keystore android.keystore -alias android \
     -keyalg RSA -keysize 2048 -validity 10000

2) حوّل الملف إلى base64 (Linux/macOS):
   base64 -w0 android.keystore > keystore.b64
   (على macOS: base64 -i android.keystore | tr -d '\n' > keystore.b64)

3) في GitHub: Repository → Settings → Secrets and variables → Actions → New repository secret
   - KEYSTORE_BASE64 = محتوى ملف keystore.b64 كاملاً
   - KEYSTORE_PASSWORD = كلمة مرور الـ keystore
   - KEY_PASSWORD = كلمة مرور المفتاح (غالباً نفس أعلاه)

4) شغّل الـ workflow: Actions → "Android TWA (Bubblewrap AAB)" → Run workflow

5) بعد أول build ناجح: خذ SHA-256 للتوقيع وضعه في Vercel:
   ANDROID_TWA_PACKAGE_NAME = نفس packageId في twa-manifest.json
   ANDROID_TWA_SHA256_FINGERPRINTS = البصمة

packageId الافتراضي: com.aiverce.carerp — غيّره عند التشغيل اليدوي إن لزم.
