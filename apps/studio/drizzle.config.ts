import type { Config } from 'drizzle-kit';

export default {
  schema: './server/adapters/store/sqlite/schema/index.ts',
  out: './server/adapters/store/sqlite/migrations',
  dialect: 'sqlite',
} satisfies Config;
