// ★ つむぎ 純粋ロジック (副作用なし)。 ここに集約して自動テスト(logic.test.js)で守る。
//   App.jsx から import して使う(同じ実装を使うことで「テストが通る=本番も正しい」を担保)。

// 招待トークン: 任意オブジェクト ⇄ URLセーフ base64 (UTF-8対応)
export const encodeInviteToken = (obj) => {
  try {
    const json = JSON.stringify(obj);
    const utf8 = unescape(encodeURIComponent(json));
    return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch { return ''; }
};
export const decodeInviteToken = (token) => {
  try {
    if (!token) return null;
    let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const utf8 = atob(b64);
    return JSON.parse(decodeURIComponent(escape(utf8)));
  } catch { return null; }
};

// 入力コード正規化: 半角化・大文字化・ハイフン自動補完 (FAM-XXXX-XXXX)
export const normalizeInviteCode = (raw) => {
  const s = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  // ★ 2026-09-27: 数字8桁コード(1234-5678)。数字だけの入力は 4-4 区切りに整形(9桁以上は末尾を切る)
  if (/^[0-9]+$/.test(s)) { const d = s.slice(0, 8); return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4)}`; }
  if (s.length <= 3) return s;
  if (s.length <= 7) return `${s.slice(0, 3)}-${s.slice(3)}`;
  return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7, 11)}`;
};

// 個別運動スロット {itemId,value} の表示用解決。
//   - object 以外(通常運動): そのまま返す(呼び出し側で別処理)
//   - value が '○'/'◯' : 基準値(individualExercises[].defaultValue)に変換。 基準値が無ければ null
//   - value が ×・✕・x・ー・- ・空 : null (実施なし)
//   - それ以外(数値等): その値
//   mode='circle' のときは「実施なら'○'」を返す(連絡帳用)。
export const resolveIndividualExerciseValue = (slotVal, individualExercises, mode) => {
  if (!slotVal || typeof slotVal !== 'object') return undefined; // 個別運動でない
  const val = String(slotVal.value == null ? '' : slotVal.value).trim();
  const NONE = ['', '×', '✕', 'x', 'ー', '-'];
  if (mode === 'circle') {
    // ★ 明示的な「×(実施しなかった)」は割当(itemId)の有無に関わらず非表示(2026-09-02 CI単体テストが検出した実バグ修正)。
    //   従来は割当があると×でも○を返し、連絡帳に「実施した」と誤表示されていた。
    if (['×', '✕', 'x'].includes(val)) return null;
    if (NONE.includes(val) && !slotVal.itemId) return null;
    if (NONE.includes(val)) return slotVal.itemId ? '○' : null; // 空/ー は割当あり=規定値で実施の扱い
    return '○'; // 実施 → ○
  }
  if (val === '○' || val === '◯') {
    const ind = (individualExercises || []).find(x => x.itemId === slotVal.itemId);
    const dv = String((ind && ind.defaultValue) || '').trim();
    return dv || null;
  }
  if (NONE.includes(val)) return null;
  return val;
};

// 出席率(0-100)から①サービスの実施状況プルダウンの既定選択を返す。
export const monitoringStatusFromRate = (attended, rate) => {
  if (!attended) return '実施できなかった';
  if (rate != null && rate >= 100) return '実施できた';
  if (rate != null && rate >= 50) return '概ね実施できた';
  return '一部実施できなかった';
};

// 運動の「主数値」を取り出す ("10/20"→10, "15分"→15, "3往復"→3, "○"/"ー"/空→null)
export const exercisePrimaryNumber = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || s === '○' || s === '◯' || s === 'ー' || s === '-' || s === '×') return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};

// =========================================================
// ★ 2026-10-02(扇橋 上野様「Surfaceで欠席にしたのにiPadで出席に戻る」調査で判明した同期の穴の対策)
// =========================================================

// 同じ値か(オブジェクトのキーの順番は問わない・値が undefined のキーは「無い」と同じ)。最初の違いで打ち切る。
export const deepSame = (a, b) => {
  if (a === b) return true;
  if (a === undefined || b === undefined) return a === b;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b));
    return false;
  }
  const aa = Array.isArray(a), ba = Array.isArray(b);
  if (aa !== ba) return false;
  if (aa) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { const x = a[i] === undefined ? null : a[i], y = b[i] === undefined ? null : b[i]; if (!deepSame(x, y)) return false; }
    return true;
  }
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) { if (!Object.prototype.hasOwnProperty.call(b, k) || !deepSame(a[k], b[k])) return false; }
  return true;
};

// ① 店舗データ(app_state)の書き込み前の判定: 時刻の印(__clock)と「最後に保存した端末」(_lastSync)以外が同じなら書かなくてよい。
//   これを書くと版(version)だけが進み、他の端末が受信→保存し直す、を繰り返す空回り(扇橋で毎秒1回以上)の原因になっていた。
const STATE_META_KEYS = new Set(['__clock', '_lastSync']);
export const sameStateIgnoringMeta = (a, b) => {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a).filter(k => !STATE_META_KEYS.has(k) && a[k] !== undefined);
  const kb = Object.keys(b).filter(k => !STATE_META_KEYS.has(k) && b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) { if (!deepSame(a[k], b[k])) return false; }
  return true;
};

// ② 保存の土台(base)より後に別経路(提供記録テーブルの受信など)で手元(cur)へ届いた記録の変更を、
//   保存する内容(next)に取り込む。next が base から変えていない項目に限り cur の値を採用する(保存で変えた項目は next のまま)。
//   これが無いと、受信の直後に古い画面から保存したとき、届いたばかりの他端末の変更(欠席など)が端末内から消えていた。
//   戻り値: { recs, n } (n = 取り込んだ記録数。0 なら next をそのまま使ってよい)
export const reconcileRemoteRecords = (curRecs, baseRecs, nextRecs) => {
  const cur = Array.isArray(curRecs) ? curRecs : [], base = Array.isArray(baseRecs) ? baseRecs : [], next = Array.isArray(nextRecs) ? nextRecs : [];
  if (cur === base) return { recs: next, n: 0 };
  const bMap = new Map(base.filter(r => r && r.id != null).map(r => [String(r.id), r]));
  const cMap = new Map(cur.filter(r => r && r.id != null).map(r => [String(r.id), r]));
  let n = 0;
  const out = next.map(nr => {
    if (!nr || nr.id == null) return nr;
    const id = String(nr.id); const b = bMap.get(id), c = cMap.get(id);
    if (!c || !b || c === b) return nr;
    let o = null;
    new Set([...Object.keys(c), ...Object.keys(b)]).forEach(k => {
      if (k === 'id' || k === '_savedAt' || k === '_fieldTs') return;
      if (deepSame(c[k], b[k])) return;          // 届いた変更なし
      if (!deepSame(nr[k], b[k])) return;        // この保存で変えた項目 → 保存の値を優先
      if (!o) o = { ...nr };
      if (c[k] === undefined) delete o[k]; else o[k] = c[k];
    });
    if (!o) return nr;
    const f = { ...(nr._fieldTs || {}) }; const cf = c._fieldTs || {};
    Object.keys(cf).forEach(k => { if ((Number(cf[k]) || 0) > (Number(f[k]) || 0)) f[k] = cf[k]; });
    if (Object.keys(f).length) o._fieldTs = f;
    o._savedAt = Math.max(Number(nr._savedAt) || 0, Number(c._savedAt) || 0);
    n++; return o;
  });
  // 土台に無く手元にだけ届いた記録(他端末の新規)は、保存の内容に無ければ足す(この保存で消したものではない)
  const nIds = new Set(next.filter(r => r && r.id != null).map(r => String(r.id)));
  cur.forEach(c => { if (!c || c.id == null) return; const id = String(c.id); if (!nIds.has(id) && !bMap.has(id)) { out.push(c); n++; } });
  return { recs: out, n };
};

// ③ 提供記録入力の画面(下書き)を、編集中でも最新の内容で作り直す。
//   fresh=最新の内容で作った行 / draft=いまの画面の行 / base=前回作り直した時点の行(同じ利用者id)。
//   この端末で変えた項目(draft が base と違う項目)だけ下書きの値を残し、それ以外は最新(fresh)にする。
//   これが無いと、編集中は他端末の変更(欠席など)が画面に出ず、その古い画面の自動保存が端末内の記録を古い値に戻していた。
//   戻り値: { rows, base, kept } (base = 次回の比較用。残した項目は前回の base の値のまま持ち越す)
export const mergeDraftRows = (freshRows, draftRows, baseRows) => {
  const fresh = Array.isArray(freshRows) ? freshRows : [], draft = Array.isArray(draftRows) ? draftRows : [], base = Array.isArray(baseRows) ? baseRows : [];
  const dMap = new Map(draft.filter(r => r && r.id != null).map(r => [String(r.id), r]));
  const bMap = new Map(base.filter(r => r && r.id != null).map(r => [String(r.id), r]));
  const rows = [], nextBase = []; let kept = 0; const seen = new Set();
  fresh.forEach(f => {
    if (!f || f.id == null) { rows.push(f); nextBase.push(f); return; }
    const id = String(f.id); seen.add(id);
    const d = dMap.get(id), b = bMap.get(id);
    if (!d && b) { nextBase.push(b); kept++; return; }        // この端末で画面から外した行(振替の取り消し待ち等) → 外したまま
    if (d && !b) { rows.push(d); kept++; return; }            // 前回の後にこの端末で足した行 → 下書きのまま
    if (!d || deepSame(d, b)) { rows.push(f); nextBase.push(f); return; }
    const r = { ...f }, nb = { ...f };
    new Set([...Object.keys(d), ...Object.keys(b)]).forEach(k => {
      if (deepSame(d[k], b[k])) return;     // 触っていない項目 → 最新
      if (d[k] === undefined) delete r[k]; else r[k] = d[k];
      if (b[k] === undefined) delete nb[k]; else nb[k] = b[k];
      kept++;
    });
    rows.push(r); nextBase.push(nb);
  });
  // 最新に無いが下書きで触っていた行(この端末で追加した等)は残す
  draft.forEach(d => { if (!d || d.id == null) return; const id = String(d.id); if (seen.has(id)) return; const b = bMap.get(id); if (b && deepSame(d, b)) return; rows.push(d); if (b) nextBase.push(b); kept++; });
  return { rows, base: nextBase, kept };
};
