// 2026-10-17 データ保護(段階1): Supabase の証を全アクセスに添える(無ければ公開キー)
import { describe, it, expect, vi, beforeAll } from 'vitest';
let mod;
beforeAll(async () => {
  if (!globalThis.WebSocket) { globalThis.WebSocket = class { constructor() {} close() {} send() {} addEventListener() {} removeEventListener() {} }; } // Node20 には WebSocket が無い(リアルタイム部品の読み込み用)
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
  globalThis.sessionStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
  globalThis.localStorage = globalThis.localStorage || { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
  mod = await import('./supabase.js');
});
describe('Supabase の証(JWT)', () => {
  it('証が無いときは公開キー(anon)で Authorization を付ける', async () => {
    const calls = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => { calls.push(new Headers(init.headers).get('Authorization')); return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }); });
    await mod.supabase.from('stores').select('id').limit(1);
    expect(calls[0]).toBe('Bearer anon-key-test');
    fetchSpy.mockRestore();
  });
  it('証を入れると Bearer <証> になり、消すと anon に戻る。sessionStorage にも控える', async () => {
    mod.setSbAccessToken('header.payload.sig', Date.now() + 3600 * 1000);
    expect(mod.getSbAccessState().has).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('tsumugiSbJwt')).token).toBe('header.payload.sig');
    const calls = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => { calls.push(new Headers(init.headers).get('Authorization')); return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }); });
    await mod.supabase.from('stores').select('id').limit(1);
    expect(calls[0]).toBe('Bearer header.payload.sig');
    mod.setSbAccessToken(null);
    await mod.supabase.from('stores').select('id').limit(1);
    expect(calls[1]).toBe('Bearer anon-key-test');
    expect(sessionStorage.getItem('tsumugiSbJwt')).toBe(null);
    fetchSpy.mockRestore();
  });
  it('期限切れの証は使わない(anon に戻る)', async () => {
    mod.setSbAccessToken('old.token.sig', Date.now() - 1000);
    const calls = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => { calls.push(new Headers(init.headers).get('Authorization')); return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }); });
    await mod.supabase.from('stores').select('id').limit(1);
    expect(calls[0]).toBe('Bearer anon-key-test');
    fetchSpy.mockRestore();
  });
});
