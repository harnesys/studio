import type { Config } from 'drizzle-kit';

export default {
  schema: './adapters/store/sqlite/schema/index.ts',
  out: './adapters/store/sqlite/migrations',
  dialect: 'sqlite',
} satisfies Config;
