// 2026-10-17 データ保護(段階2): 同期診断の控え(端末ID鍵・証の有無)・端末名の自動付与・管理局の一覧化
import { describe, it, expect, vi, beforeAll } from 'vitest';
let mod;
// app_state の PostgREST をメモリで真似る(select / insert / update(version 条件))
const rows = new Map();
function mockFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init && init.method) || 'GET';
    const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } });
    if (!url.pathname.endsWith('/app_state')) return json([]);
    const keyEq = url.searchParams.get('key'); const key = keyEq ? keyEq.replace(/^eq\./, '') : null;
    const keyLike = url.searchParams.get('key') && url.searchParams.get('key').startsWith('like.') ? url.searchParams.get('key').slice(5).replace(/%/g, '') : null;
    if (method === 'GET') {
      if (keyLike != null) return json([...rows.entries()].filter(([k]) => k.startsWith(keyLike)).map(([k, r]) => ({ key: k, data: r.data })));
      const r = rows.get(key); return json(r ? [{ data: r.data, version: r.version }] : []);
    }
    const body = JSON.parse(init.body || '{}');
    if (method === 'POST') { if (rows.has(body.key)) return json({ message: 'dup' }, 409); rows.set(body.key, { data: body.data, version: body.version || 0 }); return json([{ version: body.version || 0 }]); }
    if (method === 'PATCH') { const ver = Number(url.searchParams.get('version').replace(/^eq\./, '')); const r = rows.get(key); if (!r || r.version !== ver) return json([]); rows.set(key, { data: body.data, version: body.version }); return json([{ version: body.version }]); }
    return json([]);
  });
}
beforeAll(async () => {
  if (!globalThis.WebSocket) { globalThis.WebSocket = class { constructor() {} close() {} send() {} addEventListener() {} removeEventListener() {} }; }
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
  const mem = () => ({ _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } });
  globalThis.sessionStorage = mem(); globalThis.localStorage = mem();
  mod = await import('./supabase.js');
});
describe('端末の控えと端末名の自動付与', () => {
  it('端末IDは一度作ったら変わらない', () => {
    const a = mod.getDeviceId(); const b = mod.getDeviceId();
    expect(a).toBe(b); expect(a.length).toBeGreaterThan(8);
  });
  it('初めての端末に「短縮名1」、2台目に「短縮名2」。同じ端末はもう一度呼んでも同じ名前', async () => {
    const f = mockFetch();
    const n1 = await mod.supabaseClaimDeviceName('s1', '南水元');
    expect(n1).toBe('南水元1');
    const again = await mod.supabaseClaimDeviceName('s1', '南水元');
    expect(again).toBe('南水元1');
    // 別の端末(端末IDを変える)
    localStorage.setItem('tsumugiDeviceId', 'other-device');
    const n2 = await mod.supabaseClaimDeviceName('s1', '南水元');
    expect(n2).toBe('南水元2');
    f.mockRestore();
  });
  it('手で付けた名前・旧形式(端末名|版)の名前とは重ならない番号を選ぶ', async () => {
    const f = mockFetch();
    const cur = rows.get('diag_s1').data;
    cur['南水元3|upd-2026-1001-1001a'] = { at: Date.now(), logs: [] }; // 旧形式の端末が 3 を使っている
    rows.set('diag_s1', { data: cur, version: rows.get('diag_s1').version });
    localStorage.setItem('tsumugiDeviceId', 'third-device');
    const n3 = await mod.supabaseClaimDeviceName('s1', '南水元');
    expect(n3).toBe('南水元4');
    f.mockRestore();
  });
  it('診断の控えは端末IDが鍵で name/ver/sb を持ち、同じ端末名の旧形式の控えは消える。一覧は __ で始まる鍵を除く', async () => {
    const f = mockFetch();
    localStorage.setItem('tsumugiDeviceId', 'dev-x');
    const cur = rows.get('diag_s1').data;
    cur['南水元9|upd-2026-1001-1001a'] = { at: Date.now() - 1000, logs: [] };
    rows.set('diag_s1', { data: cur, version: rows.get('diag_s1').version });
    mod.setSbAccessToken('h.p.s', Date.now() + 3600 * 1000);
    const ok = await mod.supabaseUploadSyncDiag('s1', '南水元9', 'upd-2026-1017-trial315');
    expect(ok).toBe(true);
    const d = rows.get('diag_s1').data;
    expect(d['dev-x']).toMatchObject({ name: '南水元9', ver: 'upd-2026-1017-trial315', sb: true });
    expect(d['南水元9|upd-2026-1001-1001a']).toBeUndefined();
    expect(d.__names).toBeTruthy();
    const list = await mod.supabaseListSyncDiag();
    const s1 = list.find(x => x.storeId === 's1');
    expect(s1.devices.some(x => x.tag.startsWith('__'))).toBe(false);
    const me = s1.devices.find(x => x.tag === 'dev-x');
    expect(me).toMatchObject({ name: '南水元9', ver: 'upd-2026-1017-trial315', sb: true });
    const old = s1.devices.find(x => x.tag === '南水元3|upd-2026-1001-1001a');
    expect(old).toMatchObject({ name: '南水元3', ver: 'upd-2026-1001-1001a', sb: null });
    mod.setSbAccessToken(null);
    f.mockRestore();
  });
});
