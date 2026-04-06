-- لقطات شاشة ومسار الصفحة مع الملاحظات؛ رد السوبر أدمن
ALTER TABLE user_feedback ADD COLUMN screenshot_url TEXT;
ALTER TABLE user_feedback ADD COLUMN page_path TEXT;
ALTER TABLE user_feedback ADD COLUMN admin_reply TEXT;
ALTER TABLE user_feedback ADD COLUMN admin_replied_at TEXT;
ALTER TABLE user_feedback ADD COLUMN admin_replied_by TEXT;
