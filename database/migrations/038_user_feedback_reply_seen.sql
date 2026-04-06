-- 0 = رد الإدارة جديد ولم يُعرَف بعد من المستخدم (إشعار)
ALTER TABLE user_feedback ADD COLUMN user_reply_seen INTEGER NOT NULL DEFAULT 1;
