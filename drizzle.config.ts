import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "file:./dev-local.sqlite",
  },
  strict: true,
  verbose: true,
} satisfies Config;
