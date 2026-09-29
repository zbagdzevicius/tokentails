// Deterministic AI stub for verify/refresh tests. fund verify and fund refresh must never call AI:
// if this runs, it records the call in $VERIFY_AI_MARKER so the test can fail loudly.
import { appendFileSync } from 'node:fs';
let prompt = '';
process.stdin.on('data', (d) => { prompt += d; });
process.stdin.on('end', () => {
  if (process.env.VERIFY_AI_MARKER) appendFileSync(process.env.VERIFY_AI_MARKER, `called: ${prompt.slice(0, 40)}\n`);
  process.stdout.write(/review/i.test(prompt) ? 'Score: 5/10\n' : 'OK\n');
});
