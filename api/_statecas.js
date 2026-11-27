// ★ 2026-11-27 1128a/trial657: サーバーから店舗データ(app_state)を書くときの共通の関所(api/portal.js の casUpdate と同じ考え)。
//   読んだ版(version)と同じときだけ書き、版を 1 上げる。ぶつかったら読み直してやり直す(最大 6 回)。
//   ・版を見ずに丸ごと書くと、読んでから書くまでのあいだに端末が保存した内容を、読んだときの古い内容で上書きしてしまう
//   ・版を上げないと、端末は「変わっていない」とみなして取り直さない(trial624 以降)
//   mutate(data) は「書く内容」を返す。null を返したら何も書かない。毎回、読み直した最新の内容が渡る。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function casUpdateStoreData(supa, key, mutate, maxTries = 6) {
  for (let i = 0; i < maxTries; i++) {
    const r = await supa.from('app_state').select('data, version').eq('key', String(key)).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) return { ok: false, reason: 'no-row' };
    const hasVer = r.data.version != null;
    const base = Number(r.data.version) || 0;
    const next = await mutate(r.data.data || {});
    if (next == null) return { ok: true, noop: true, version: base };
    try { next.__clock = Math.max(Number(r.data.data && r.data.data.__clock) || 0, Date.now()); } catch {}
    let q = supa.from('app_state').update({ data: next, version: base + 1 }).eq('key', String(key));
    q = hasVer ? q.eq('version', base) : q.is('version', null);
    const u = await q.select('version');
    if (u.error) throw u.error;
    if (Array.isArray(u.data) && u.data.length) return { ok: true, version: base + 1 };
    await sleep(120 * (i + 1) + Math.floor(Math.random() * 100)); // ぶつかった → 読み直してやり直す
  }
  return { ok: false, reason: 'conflict' };
}
