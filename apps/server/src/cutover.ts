import { defaultHomePath } from './adapters/store/studio-layout.ts';
import { cutoverStudioDb } from './application/nodes/cutover-studio-db.ts';
import { logger } from './config/logger.ts';

const home = defaultHomePath();
logger.info({ scope: 'cutover' }, `cutover start home=${home}`);
try {
  const result = cutoverStudioDb(home);
  logger.info(
    { scope: 'cutover' },
    `done migrated=${result.migrated.join(',') || '(none)'} skipped=${result.skipped.join(',') || '(none)'} bak=${result.bakPath ?? '(none)'}`,
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        home,
        migrated: result.migrated,
        skipped: result.skipped,
        bakPath: result.bakPath,
      },
      null,
      2,
    ),
  );
} catch (err) {
  logger.error(
    { scope: 'cutover' },
    `cutover failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
