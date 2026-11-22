import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ★ 2026-11-22 trial610(ユーザー「ログインに数秒・更新が長い」): update-notes.json(約850KB・1000件超)を束(JS)に焼き込まず、
//   版の番号だけ define で焼く。あわせて小さな public/version.json(版・最低版・表示範囲・更新内容の印)をここで作る。
//   端末の定期確認(1分ごと)は version.json を読み、更新内容の本体は印(notesSig)が変わったときだけ読む。
//   version.json は組み立てのたびに作り直す(git には入れない・.gitignore)。
const __dir = path.dirname(fileURLToPath(import.meta.url));
let _notes = {}; let _raw = '';
try { _raw = fs.readFileSync(path.join(__dir, 'public', 'update-notes.json'), 'utf8'); _notes = JSON.parse(_raw); }
catch (e) { console.warn('[vite] public/update-notes.json を読めません:', e && e.message); }
const _ver = String(_notes.version || '');
const _verJson = {
  version: _ver,
  minVersion: String(_notes.minVersion || ''),
  prompt: (_notes.prompt === undefined ? 'all' : _notes.prompt),
  updatedAt: String(_notes.updatedAt || ''),
  notesCount: Array.isArray(_notes.notes) ? _notes.notes.length : 0,
  notesSig: crypto.createHash('sha1').update(_raw).digest('hex').slice(0, 12),
};
try { fs.writeFileSync(path.join(__dir, 'public', 'version.json'), JSON.stringify(_verJson) + '\n'); }
catch (e) { console.warn('[vite] public/version.json を書けません:', e && e.message); }

export default defineConfig({
  plugins: [react()],
  define: { __TSU_APP_VERSION__: JSON.stringify(_ver) },
  // ★ 最小化しても関数・クラス名を残す。 本番のエラースタック(uZ等)を読める名前にして原因特定を容易にする。
  esbuild: { keepNames: true },
  build: {
    chunkSizeWarningLimit: 5000,
    minify: 'esbuild',
  },
});
