-- بريد من حُذفت شركته — لا يحصل على الرصيد الترحيبي عند إعادة التسجيل
CREATE TABLE IF NOT EXISTS welcome_gift_excluded_emails (
  email TEXT PRIMARY KEY,
  excluded_at TEXT DEFAULT (datetime('now'))
);
