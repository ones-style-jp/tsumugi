// 2026-11-05 trial525: 改行の数え方(改行すると、その行の残りの字数も使った数に)・上限を超えた古い文は切らない
//   実行: node scripts/chk_1105nl.mjs   (App.jsx から関数を取り出して確かめる)
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const pick = (name) => { const m = src.match(new RegExp(`^const ${name} = .*$`, 'm')); if (!m) throw new Error('not found ' + name); return m[0]; };
const code = ['tsuNlLen', 'tsuNlCut', 'tsuNlKeep', 'tsuNlFit'].map(pick).join('\n') + '\nreturn { tsuNlLen, tsuNlCut, tsuNlKeep, tsuNlFit };';
const { tsuNlLen, tsuNlCut, tsuNlKeep, tsuNlFit } = new Function(code)();
const r = {};
r.plain = tsuNlLen('あいう', 10) === 3;
r.nl_first = tsuNlLen('\n', 10) === 10;                       // 最初に改行 → 10
r.nl_rest = tsuNlLen('あいう\nえ', 10) === 11;                  // 3字の行で改行 → その行の残り7も使う(10)+1
r.nl_full = tsuNlLen('あいうえおかきくけこ\nさ', 10) === 11;     // ちょうど1行で改行 → 10+1
r.nl_wrap = tsuNlLen('あいうえおかきくけこさ\nし', 10) === 21;   // 2行目の途中で改行 → 20+1
r.no_c = tsuNlLen('あ\nい', undefined) === 3;                   // 1行の字数が無い欄は今までどおり
r.cut = tsuNlLen(tsuNlCut('\n\n\nあいう', 10, 25), 10) <= 25 && tsuNlCut('\n\n\nあいう', 10, 25).startsWith('\n\n');
r.keep_old = tsuNlKeep('あ\n\n\n\nい', 10, 20, 'あ\n\n\n\nいう') === 'あ\n\n\n\nい';   // 古い長い文を減らす直しは通る
r.keep_nogrow = tsuNlKeep('あ\n\n\n\nいうえ', 10, 20, 'あ\n\n\n\nいう') === 'あ\n\n\n\nいう'; // 増やすのは止める(消さない)
r.fit_composing = tsuNlFit({ target: { value: '\n'.repeat(9) }, nativeEvent: { isComposing: true } }, 10, 20, '') === '\n'.repeat(9);
console.log(r); const ok = Object.values(r).every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
