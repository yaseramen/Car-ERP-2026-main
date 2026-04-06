import { createClient } from "@libsql/client";

const tursoUrl = process.env.TURSO_DATABASE_URL!;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN!;

if (!tursoUrl || !tursoAuthToken) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env");
}

export const db = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken,
});
