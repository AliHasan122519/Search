// Publishes an APK to the update repository: node scripts/publish_update.mjs <apk> <repoDir> "<notes>"
// Reads versionCode from android/app/build.gradle, copies the APK to <repoDir>/apk/almaktaba.apk and writes <repoDir>/content/manifest.json
// (the app's own manifest plus the "apk" entry). Then commit and push <repoDir>: every installed copy offers «تحديث الآن» at its next launch.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [apk, repo, notes = ''] = process.argv.slice(2);
if (!apk || !repo) { console.error('usage: node scripts/publish_update.mjs <apk> <repoDir> "<notes>"'); process.exit(1); }
const code = Number(/versionCode\s+(\d+)/.exec(readFileSync('android/app/build.gradle', 'utf8'))?.[1]);
const base = (/VITE_CONTENT_URL=(.*)/.exec(readFileSync('.env.android', 'utf8'))?.[1] ?? '').trim().replace(/content\/?$/, '');
if (!code || !base) { console.error('versionCode or VITE_CONTENT_URL not found'); process.exit(1); }
mkdirSync(join(repo, 'apk'), { recursive: true }); mkdirSync(join(repo, 'content'), { recursive: true });
copyFileSync(apk, join(repo, 'apk', 'almaktaba.apk'));
const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8'));
manifest.apk = { versionCode: code, url: `${base}apk/almaktaba.apk?v=${code}` };
writeFileSync(join(repo, 'content', 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log('published versionCode', code, '→', manifest.apk.url);
