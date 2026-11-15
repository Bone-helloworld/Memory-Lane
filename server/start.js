// The process Azure App Service starts. Seeds the demo accounts only when ALLOW_DEMO=true,
// and that seed deletes only @memorylane.local rows. ALLOW_DEMO=false starts the server
// and leaves every account, including old demo rows, exactly as it is.
import { loadConfig } from './config.js';
import { shouldSeedDemo } from './lib/demo.js';

const config = loadConfig();
if (shouldSeedDemo(config)) {
  await import('./seed.js');
} else {
  console.log('ALLOW_DEMO is not true — demo data was not reset. Existing accounts are unchanged.');
}
await import('./index.js');
