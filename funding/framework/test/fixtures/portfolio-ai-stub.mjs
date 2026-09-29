#!/usr/bin/env node
// Deterministic AI stub for portfolio / Track E tests. Reads the prompt on stdin and prints a canned
// answer chosen by keywords. Set FUND_AI_CMD="node <this file>".
import { readFileSync } from 'node:fs';

const prompt = readFileSync(0, 'utf8');

if (/You triage funding-source changes/.test(prompt)) {
  const rows = [
    { source: 'api', opportunity: 'YES', track: 'B', program: 'Gamma Builders Grant', url: 'https://gamma.example/grants', deadline: '2026-12-01', reason: 'Remote grant, open call' },
    { source: 'api', opportunity: 'YES', track: 'B', program: 'Gamma Builders Grant', url: 'https://gamma.example/grants/', deadline: '2026-12-01', reason: 'Same call listed twice' },
    { source: 'feed', opportunity: 'YES', track: 'A', program: 'Existing Hackathon', url: 'https://existing.example/hack', deadline: 'rolling', reason: 'Remote hackathon prize' },
    { source: 'page', opportunity: 'YES', track: 'C', program: 'BGA Ascend 2027', url: 'https://bga.example/ascend', deadline: 'rolling', reason: 'Accelerator' },
    { source: 'page', opportunity: 'YES', track: 'C', program: 'Mantle EcoFund', url: 'https://mantle.example', deadline: 'rolling', reason: 'Grant' },
    { source: 'page', opportunity: 'YES', track: 'B', program: 'Desert Residency', url: 'https://desert.example', deadline: 'rolling', reason: 'Six-week residency, relocation required' },
    { source: 'page', opportunity: 'YES', track: 'B', program: 'Cloudy Startups', url: 'https://cloudy.example', deadline: 'rolling', reason: 'Free credits for startups' },
    { source: 'wp', opportunity: 'YES', track: 'D', program: 'Old Round', url: 'https://old.example', deadline: '2020-01-01', reason: 'Remote grant' },
    { source: 'wp', opportunity: 'YES', track: 'z', program: 'Delta Prize', url: 'https://delta.example/prize', deadline: 'rolling', reason: 'Remote prize' },
    { source: 'gone', opportunity: 'NO', track: 'C', program: 'Nothing', url: '', deadline: 'rolling', reason: 'cosmetic' },
    { source: 'boom', opportunity: 'CHECK', track: 'B', program: 'Unclear', url: '', deadline: 'rolling', reason: 'page down' },
  ];
  process.stdout.write(`api | YES | B | 2026-12-01 | Gamma Builders Grant opened | node bin/fund.mjs new gamma-builders-grant --track B\n\nMost urgent: Gamma.\n\n\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\`\n`);
} else {
  process.stdout.write('stub: no canned answer for this prompt\n');
}
