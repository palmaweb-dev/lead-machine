import 'dotenv/config';
import { logger } from './utils/logger.js';

logger.info(`
╔═══════════════════════════════════════╗
║  🤖  LEAD MACHINE  v1.0.0            ║
║  Prospecção B2B Automatizada         ║
╚═══════════════════════════════════════╝`);

await import('./scheduler/cron.js');
await import('./dashboard/server.js');
