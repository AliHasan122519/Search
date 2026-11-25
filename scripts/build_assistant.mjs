// Builds content/assistant.json (the assistant's phrases and topics) from data/assistant/{phrases,topics}.json and refreshes its entry in content/manifest.json.
// node scripts/build_assistant.mjs   (then commit; installed apps take the new phrases through the content update)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const phrases = JSON.parse(readFileSync('data/assistant/phrases.json', 'utf8'));
const topics = JSON.parse(readFileSync('data/assistant/topics.json', 'utf8'));
const h = [];
for (const [cat, list] of Object.entries(phrases)) for (const t of list) h.push([cat, t, '']);
for (const t of topics) h.push(['topic', JSON.stringify(t), '']);
const out = JSON.stringify({ h });
if (process.argv.includes('--check')) { const cur = readFileSync('content/assistant.json', 'utf8'); console.log(cur === out ? 'identical' : 'DIFFERENT', h.length, 'rows'); process.exit(0); }
writeFileSync('content/assistant.json', out);
const m = JSON.parse(readFileSync('content/manifest.json', 'utf8'));
const tab = m.tabs.find((t) => t.id === 'assistant');
tab.sha256 = createHash('sha256').update(out).digest('hex'); tab.count = h.length;
writeFileSync('content/manifest.json', JSON.stringify(m, null, 1) + '\n');
console.log('assistant.json rebuilt:', h.length, 'rows');
