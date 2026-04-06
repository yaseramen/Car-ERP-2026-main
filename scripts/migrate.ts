/**
 * تشغيل migrations قاعدة البيانات
 * Run: npx tsx scripts/migrate.ts
 */
import "dotenv/config";
import { runMigrations } from "../src/lib/db/migrate";

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
