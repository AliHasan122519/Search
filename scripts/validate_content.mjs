// node scripts/validate_content.mjs : checks every book of the content (files, hashes, covers, contents tables, text, scans) and prints what is wrong.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const manifest = J('content/manifest.json');
const problems = []; const notes = []; let books = 0;
const bad = (b, m) => problems.push(`${b}: ${m}`);
// 1) every listed file exists with the listed hash and size
const listed = new Map((manifest.files ?? []).map((f) => [f.file, f]));
for (const f of manifest.files ?? []) {
  const p = `content/${f.file}`; if (!existsSync(p)) { bad('files', `missing ${f.file}`); continue; }
  const buf = readFileSync(p); if (buf.length !== f.size) bad('files', `size differs ${f.file}`);
  if (createHash('sha256').update(buf).digest('hex') !== f.sha256) bad('files', `sha256 differs ${f.file}`);
}
for (const t of manifest.tabs) { if (!t.file) continue; const p = `content/${t.file}`; if (!existsSync(p)) { bad('tabs', `missing ${t.file}`); continue; } const h = createHash('sha256').update(readFileSync(p)).digest('hex'); if (t.sha256 && h !== t.sha256) bad('tabs', `sha256 differs ${t.file}`); }
// 2) every book
const texts = new Map(); const loadText = (f) => { if (!texts.has(f)) texts.set(f, existsSync(`content/${f}`) ? J(`content/${f}`) : null); return texts.get(f); };
for (const tab of manifest.tabs.filter((t) => t.card === 'library')) {
  for (const row of J(`content/${tab.file}`).h) {
    books++; const title = row[0]; let c; try { c = JSON.parse(row[6]); } catch { bad(title, 'card is not valid JSON'); continue; }
    const where = `${tab.id} / ${title}`;
    if (!c.toc?.length) notes.push(`${where}: no contents table`);
    if (c.cover?.img) { if (!existsSync(`content/${c.cover.img}`)) bad(where, `cover missing ${c.cover.img}`); else if (!listed.has(c.cover.img)) bad(where, `cover not in manifest files: ${c.cover.img}`); }
    const tf = c.reader?.mode === 'text' ? c.reader.file : c.reader?.text?.file;
    if (c.reader?.mode === 'embed' && !c.reader.id) bad(where, 'embed reader without an id');
    if (tf) {
      if (!listed.has(tf)) bad(where, `text file not in manifest files: ${tf}`);
      const t = loadText(tf); if (!t) { bad(where, `text file missing ${tf}`); }
      else {
        const n = t.p?.length ?? 0; const cnt = c.reader.mode === 'text' ? c.reader.count : c.reader.text?.count;
        if (cnt != null && cnt !== n) bad(where, `declared ${cnt} paragraphs, file has ${n}`);
        const empty = t.p.filter((x) => !String(x).trim()).length; if (empty) bad(where, `${empty} empty paragraphs`);
        const odd = t.p.filter((x) => /[�]/.test(x)).length; if (odd) bad(where, `${odd} paragraphs hold broken characters (�)`);
        for (const [l, name, i] of t.toc ?? []) if (!(i >= 0 && i < n)) bad(where, `text toc «${name}» points outside the text (${i}/${n})`);
        for (const [i] of t.pg ?? []) if (!(i >= 0 && i < n)) { bad(where, 'page marks point outside the text'); break; }
        const ar = t.p.join('').replace(/[^؀-ۿ]/g, '').length / Math.max(1, t.p.join('').length); if (ar < 0.5) notes.push(`${where}: only ${(ar * 100).toFixed(0)}% Arabic letters in the text`);
        if (t.weak?.length) notes.push(`${where}: ${t.weak.length} pages marked weak (low-quality OCR)`);
        for (const e of c.toc ?? []) { const idx = c.reader.mode === 'text' ? e[2] : e[4]; if (idx != null && !(idx >= 0 && idx < n)) { bad(where, `card toc «${e[1]}» points outside the text (${idx}/${n})`); break; } }
      }
    } else if (c.reader?.mode === 'text') bad(where, 'text reader without a file');
    for (const d of c.dls ?? []) {
      if (!/^https:\/\//.test(d.url ?? '') && !d.own) bad(where, `download link is not https: ${d.label}`);
      if (!d.id && !d.own) bad(where, `edition without an id: ${d.label}`);
      if (d.own) { const dir = `content/${d.own.dir}`; if (!existsSync(dir)) bad(where, `scan folder missing ${dir}`); else { const n = readdirSync(dir).filter((f) => f.endsWith('.jpg')).length; if (n !== d.own.n) bad(where, `scan folder has ${n} pages, card says ${d.own.n}`); } }
    }
    if (!(c.dls?.length) && !tf && c.reader?.mode !== 'embed') bad(where, 'nothing to read or download');
  }
}
console.log(`checked ${books} books, ${listed.size} listed files`);
for (const n of notes) console.log('note  ', n);
for (const p of problems) console.log('PROBLEM', p);
console.log(problems.length ? `\n${problems.length} problems` : '\nno problems'); process.exit(problems.length ? 1 : 0);
