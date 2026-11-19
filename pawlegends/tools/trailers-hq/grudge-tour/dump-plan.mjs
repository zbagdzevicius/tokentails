import { writeFileSync } from 'node:fs';
import { CUT30, CUT60 } from './plan.mjs';
writeFileSync(process.argv[2], JSON.stringify({ 30: CUT30, 60: CUT60 }, null, 1));
