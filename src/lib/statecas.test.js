// ★ 2026-11-27 1128a/trial657: サーバーから店舗データを書く関所(api/_statecas.js)。版を見て書く・ぶつかったら読み直す
import { describe, it, expect } from 'vitest';
import { casUpdateStoreData } from '../../api/_statecas.js';

// app_state 1 行だけの、にせのデータベース。between() は「読んでから書くまでのあいだ」に 1 回だけ割り込む(端末の保存のつもり)
const fakeSupa = (row, between) => {
  const log = [];
  const from = () => {
    const st = { op: null, body: null, conds: [] };
    const run = () => {
      if (st.op === 'select') { log.push('read'); return { data: row ? { data: JSON.parse(JSON.stringify(row.data)), version: row.version } : null, error: null }; }
      if (between) { const f = between; between = null; f(row); }
      const ok = st.conds.every(([k, v, is]) => (is ? row[k] == null : row[k] === v));
      log.push(ok ? 'write' : 'miss');
      if (!ok) return { data: [], error: null };
      row.data = st.body.data; row.version = st.body.version;
      return { data: [{ version: row.version }], error: null };
    };
    const q = {
      select() { if (!st.op) { st.op = 'select'; return q; } return Promise.resolve(run()); },
      update(b) { st.op = 'update'; st.body = b; return q; },
      eq(k, v) { if (k !== 'key') st.conds.push([k, v, false]); return q; },
      is(k) { st.conds.push([k, null, true]); return q; },
      maybeSingle() { return Promise.resolve(run()); },
    };
    return q;
  };
  return { from, log, row };
};

describe('casUpdateStoreData(サーバーから店舗データを書く関所)', () => {
  it('版を 1 上げて書く・渡した項目だけ変わる', async () => {
    const db = fakeSupa({ data: { patients: [{ id: 1 }], systemSettings: { a: 1 } }, version: 7 });
    const r = await casUpdateStoreData(db, 'store_x', (d) => ({ ...d, systemSettings: { ...d.systemSettings, b: 2 } }));
    expect(r.ok).toBe(true); expect(r.version).toBe(8);
    expect(db.row.version).toBe(8);
    expect(db.row.data.patients).toEqual([{ id: 1 }]);
    expect(db.row.data.systemSettings).toEqual({ a: 1, b: 2 });
  });
  it('読んでから書くまでのあいだに端末が保存したら、古い内容で上書きせず、読み直して足す', async () => {
    const db = fakeSupa({ data: { patients: [{ id: 1 }], systemSettings: {} }, version: 7 },
      (row) => { row.data = { ...row.data, patients: [{ id: 1 }, { id: 2 }] }; row.version = 8; });
    const r = await casUpdateStoreData(db, 'store_x', (d) => ({ ...d, systemSettings: { ...d.systemSettings, code: 'x' } }));
    expect(r.ok).toBe(true); expect(r.version).toBe(9);
    expect(db.log).toEqual(['read', 'miss', 'read', 'write']);
    expect(db.row.data.patients).toEqual([{ id: 1 }, { id: 2 }]); // 端末の保存が残っている
    expect(db.row.data.systemSettings.code).toBe('x');
  });
  it('行が無ければ書かない・null を返したら書かない', async () => {
    expect((await casUpdateStoreData(fakeSupa(null), 'store_x', (d) => d)).reason).toBe('no-row');
    const db = fakeSupa({ data: { a: 1 }, version: 3 });
    const r = await casUpdateStoreData(db, 'store_x', () => null);
    expect(r.noop).toBe(true); expect(db.row.version).toBe(3); expect(db.log).toEqual(['read']);
  });
  it('版が空(null)の行にも書ける', async () => {
    const db = fakeSupa({ data: { a: 1 }, version: null });
    const r = await casUpdateStoreData(db, 'store_x', (d) => ({ ...d, b: 2 }));
    expect(r.ok).toBe(true); expect(db.row.version).toBe(1); expect(db.row.data.b).toBe(2);
  });
});
