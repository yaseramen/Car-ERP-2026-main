-- بصمات الأجهزة التي حصلت على الرصيد الترحيبي — منع استغلال الرصيد المجاني
CREATE TABLE IF NOT EXISTS device_fingerprints (
  fingerprint TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);
