-- تتبع ملف صورة السوق على Vercel Blob (نفس الرابط العام في image_url) للحذف عند انتهاء/إلغاء الإعلان
ALTER TABLE marketplace_listings ADD COLUMN image_blob_url TEXT;
