// =========================================================
// つむぎ ポータル(ご家族・ケアマネ)の計算部品 【純粋関数・ブラウザとサーバー(/api/portal)で共通】 (2026-10-18 データ保護 段階3.5)
//
// ここにあるのは「クラウドの店舗データ(cloud) → 次の店舗データ」の計算だけ。通信・React・import.meta は使わない(Node でも動く)。
//   供給元: src/lib/supabase.js にあった CAS(supabaseCasUpdate)の mutate 本体をそのまま移した(処理は変えていない)。
//   返り値 null = 書き込まない(対象なし・変更なし・既反映)。
// =========================================================

export function portalMergePatientFromFamily(cloud, patientId, patientPatch, extra) {
    const currentData = cloud;
    if (!currentData) return null; // 店舗行が無い → 何もしない
    const patients = (currentData.patients || []).map(p => {
      if (String(p.id) !== String(patientId)) return p;
      // emergencyContacts は配列マージ (重複防止)。 ★ 墓石(_deletedEC: 事業所側で削除した連絡先)は復活させない
      const _ecKey = c => `${(c.name||'').trim()}|${(c.relation||'').trim()}|${(c.phone||'').trim()}|${(c.phoneMobile||'').trim()}`;
      // ★ ケアマネ由来の連絡先は緊急連絡先(家族)には一切残さない(事業所名/事業所電話/FAXを持つ or 続柄がケアマネ系)。
      //   これで「ケアマネが緊急連絡先に混入 → 削除しても復活」を根絶する。
      const _isCmC = c => !!(c && (c.cmOffice || c.officePhone || c.officeFax || /ケアマネ|介護支援|居宅/.test(String(c.relation||''))));
      const _ecTomb = new Set(p._deletedEC || []);
      let mergedContacts = (p.emergencyContacts || []).filter(c => !_ecTomb.has(_ecKey(c)) && !_isCmC(c));
      if (patientPatch.emergencyContacts) {
        const incoming = patientPatch.emergencyContacts || [];
        incoming.forEach(c => {
          if (_ecTomb.has(_ecKey(c))) return; // 削除済み(墓石)は追加しない
          if (_isCmC(c)) return;              // ケアマネは緊急連絡先に追加しない
          const dup = mergedContacts.some(ex =>
            (ex.name||'').trim() === (c.name||'').trim() &&
            (ex.relation||'').trim() === (c.relation||'').trim()
          );
          if (!dup) mergedContacts = [...mergedContacts, c];
        });
      }
      // relatedParties (その他関係者) も配列マージ (同名+同事業所は重複防止)
      let mergedRelated = p.relatedParties || [];
      if (patientPatch.relatedParties) {
        (patientPatch.relatedParties || []).forEach(c => {
          const dup = mergedRelated.some(ex =>
            (ex.name||'').trim() === (c.name||'').trim() &&
            (ex.office||'').trim() === (c.office||'').trim()
          );
          if (!dup) mergedRelated = [...mergedRelated, c];
        });
      }
      // ★ 代表家族(familyName 等)の扱い:
      //   - クラウドに代表が居らず or 「同一人物(familyName 一致)の更新」 → そのまま反映 (代表が自分の情報を編集できる)
      //   - クラウドに代表が居て「別人」が代表を上書きしようとした場合のみ → 上書きせず emergencyContacts へ追加
      //   (2人目の家族登録で代表が最新の人に化ける不具合の対策。 かつ代表本人の編集はブロックしない)
      const FAMILY_PRIMARY = ['familyName','familyLastName','familyFirstName','familyKana','familyKanaLast','familyKanaFirst','familyRelation','familyPhone','familyPhoneMobile','familyEmail'];
      const cloudName = String(p.familyName||'').trim();
      const cloudHasPrimary = !!cloudName;
      const incName = String(patientPatch.familyName||'').trim();
      // 代表フィールドを含むパッチか
      const patchHasPrimary = FAMILY_PRIMARY.some(k => patientPatch[k] !== undefined && patientPatch[k] !== null && patientPatch[k] !== '');
      // 別人による代表の上書きか (代表が居て、 名前が入っていて、 既存代表と違う)
      const isDifferentPerson = cloudHasPrimary && patchHasPrimary && incName && incName !== cloudName;
      let mergedContacts2 = mergedContacts;
      if (isDifferentPerson) {
        const incRel = String(patientPatch.familyRelation||'').trim();
        const dup2 = mergedContacts2.some(c => (c.name||'').trim() === incName && (c.relation||'').trim() === incRel);
        if (incName && !dup2) {
          mergedContacts2 = [...mergedContacts2, { name: incName, relation: incRel, phone: patientPatch.familyPhone||'', phoneMobile: patientPatch.familyPhoneMobile||'', email: patientPatch.familyEmail||'' }];
        }
      }
      // ★ docUpdates(更新通知ログ)は id で和集合マージ → 家族/CMの操作を事業所へ確実に届ける(上書きで消さない)
      let mergedDocUpdates = Array.isArray(p.docUpdates) ? p.docUpdates : [];
      if (Array.isArray(patientPatch.docUpdates)) {
        const _seenDu = new Set(mergedDocUpdates.map(u => u && u.id));
        patientPatch.docUpdates.forEach(u => { if (u && u.id && !_seenDu.has(u.id)) { mergedDocUpdates = [...mergedDocUpdates, u]; _seenDu.add(u.id); } });
        mergedDocUpdates = mergedDocUpdates.slice(-50);
      }
      // ★ フェイスシートの部分更新(2026-08-11): personalFile を丸ごと送ると事業所側の書類・会議記録等を
      //   家族端末の古いコピーで巻き戻すため、専用キー faceSheetPatch で指定サブ項目だけを重ねる。
      //   pf:faceSheet の _fieldTs を刻印し、端末間マージで巻き戻らないようにする。
      let mergedPersonalFile = p.personalFile;
      let _pfTs = null;
      if (patientPatch.faceSheetPatch && typeof patientPatch.faceSheetPatch === 'object') {
        const fsp = {};
        Object.keys(patientPatch.faceSheetPatch).forEach(k => { const v = patientPatch.faceSheetPatch[k]; if (v !== undefined && v !== null && v !== '') fsp[k] = v; });
        if (Object.keys(fsp).length) {
          mergedPersonalFile = { ...(p.personalFile || {}), faceSheet: { ...((p.personalFile || {}).faceSheet || {}), ...fsp } };
          _pfTs = { ...(p._fieldTs || {}), 'pf:faceSheet': Date.now() };
        }
      }
      const filteredPatch = {};
      Object.keys(patientPatch).forEach(k => {
        if (k === 'emergencyContacts' || k === 'relatedParties' || k === 'docUpdates' || k === 'faceSheetPatch') return;
        const v = patientPatch[k];
        if (v === undefined || v === null || v === '') return;
        // 別人が代表フィールドを上書きしようとした場合のみスキップ (本人/初回はそのまま反映)
        if (FAMILY_PRIMARY.includes(k) && isDifferentPerson) return;
        filteredPatch[k] = v;
      });
      // ★ 担当ケアマネ系(cm*)の更新は項目時刻を刻む(2026-09-03): 刻印なしだと項目別マージ側で
      //   スタッフ端末の古い刻印に負け、ケアマネ本人の更新が巻き戻るため。
      let _cmTs = _pfTs;
      { const _cmKeys = ['cmName','cmOffice','cmPhone','cmFax'].filter(k => filteredPatch[k] !== undefined);
        if (_cmKeys.length) { _cmTs = { ...(p._fieldTs || {}), ...(_cmTs || {}) }; const _tnow = Date.now(); _cmKeys.forEach(k => { _cmTs[k] = _tnow; }); } }
      return { ...p, ...filteredPatch, emergencyContacts: mergedContacts2, relatedParties: mergedRelated, docUpdates: mergedDocUpdates, personalFile: mergedPersonalFile, ...(_cmTs ? { _fieldTs: _cmTs } : {}) };
    });
    // ★ ケアマネ事業所/担当者マスタ (systemSettings) も、家族(関係者)登録で増えた分を統合 (重複は追加しない)
    let nextSettings = currentData.systemSettings || {};
    if (extra && (extra.cmOffices || extra.careManagers)) {
      nextSettings = { ...nextSettings };
      if (Array.isArray(extra.cmOffices)) {
        const exist = nextSettings.cmOffices || [];
        const names = new Set(exist.map(o => (o.name||'').trim()));
        const add = extra.cmOffices.filter(o => o && o.name && !names.has((o.name||'').trim()));
        if (add.length) nextSettings.cmOffices = [...exist, ...add];
      }
      if (Array.isArray(extra.careManagers)) {
        const exist = nextSettings.careManagers || [];
        // ★ 2026-09-30(試験版): 空白の違い(全角/半角)は同じ担当者とみなす。既存の担当者でメールが空なら、登録で入ったメールを補う(時刻付き)。
        const _n = s => String(s || '').normalize('NFKC').replace(/[\s　]/g, '');
        const key = c => `${_n(c.office)}|${_n(c.name)}`;
        const keys = new Set(exist.map(key));
        const add = extra.careManagers.filter(c => c && c.name && !keys.has(key(c)));
        const fill = new Map(extra.careManagers.filter(c => c && c.name && String(c.email || '').trim()).map(c => [key(c), c]));
        let filled = false;
        const merged = exist.map(c => { const f = fill.get(key(c)); if (f && !String(c.email || '').trim()) { filled = true; return { ...c, email: String(f.email).trim(), _emailTs: Number(f._emailTs) || Date.now() }; } return c; });
        if (add.length || filled) nextSettings.careManagers = [...merged, ...add];
      }
    }
    const updatedData = { ...currentData, patients, systemSettings: nextSettings };
    return updatedData;
}

export function portalAppendDocUpdate(cloud, patientId, e) {
      const currentData = cloud;
      if (!currentData) return null;
      let matched = false, already = false;
      const patients = (currentData.patients || []).map(p => {
        if (String(p.id) !== String(patientId)) return p;
        matched = true;
        const log = Array.isArray(p.docUpdates) ? p.docUpdates : [];
        if (log.some(u => u && u.id === e.id)) { already = true; return p; } // 同id既存=冪等スキップ
        return { ...p, docUpdates: [...log, e].slice(-50) };
      });
      if (!matched || already) return null; // 対象なし or 既反映 → 書き込まない(noop)
      return { ...currentData, patients };
}

export function portalMergeFaceSheetFromCM(cloud, patientId, faceSheet, meta, _now, _duId) {
  meta = meta || {};
      const currentData = cloud;
      if (!currentData) return null;
      let matched = false, already = false;
      const patients = (currentData.patients || []).map(p => {
        if (String(p.id) !== String(patientId)) return p;
        matched = true;
        const log = Array.isArray(p.docUpdates) ? p.docUpdates : [];
        if (log.some(u => u && u.id === _duId)) { already = true; return p; } // 同id既存=冪等スキップ
        const pf = p.personalFile || {};
        const newFs = { ...(pf.faceSheet || {}), ...(faceSheet || {}), updatedAt: _now, updatedBy: meta.updatedBy || 'ケアマネ' };
        const prevHist = Array.isArray(pf.faceSheetHistory) ? pf.faceSheetHistory : [];
        const version = ((prevHist[prevHist.length - 1] || {}).version || 0) + 1;
        const { genogramFiles, floorPlanFiles, pickupRouteFiles, ...textOnly } = newFs;
        const snapshot = { ...textOnly, _attachCounts: { genogram: (genogramFiles || []).length, floorPlan: (floorPlanFiles || []).length, pickupRoute: (pickupRouteFiles || []).length } };
        const hist = [...prevHist, { version, updatedAt: _now, updatedBy: newFs.updatedBy, source: meta.source || 'caremanager', snapshot }].slice(-20);
        // ★ 2026-10-04: 画面側で作った「どこをどう変えたか」(meta.items / meta.changes)を事業所へ届く docUpdates に載せる。by は family/caremanager
        const _ch = Array.isArray(meta.changes) ? meta.changes.filter(c => c && c.label).map(c => ({ label: String(c.label), before: String(c.before ?? '').slice(0, 200), after: String(c.after ?? '').slice(0, 200) })).slice(0, 40) : [];
        const docUpdates = [...log, { id: _duId, at: _now, by: (meta.source === 'family' ? 'family' : 'caremanager'), byName: newFs.updatedBy, items: (Array.isArray(meta.items) && meta.items.length ? meta.items : ['フェイスシート']), ...(_ch.length ? { changes: _ch } : {}), readOffice: false, readCm: true }].slice(-200);
        // ★ F1: フェイスシートの既往歴(kiou)を患者トップにもミラー(計画書/CSV/帳票が参照する source of truth)
        return { ...p, kiou: (newFs.kiou ?? p.kiou ?? ''), docUpdates, personalFile: { ...pf, faceSheet: newFs, faceSheetHistory: hist } };
      });
      if (!matched || already) return null;
      return { ...currentData, patients };
}

export function portalMergePatientDocsFromCM(cloud, patientId, patch, byName, now, _duId) {
  patch = patch || {};
    const currentData = cloud;
    if (!currentData) return null;
    let changed = [];
    const patients = (currentData.patients || []).map(p => {
      if (String(p.id) !== String(patientId)) return p;
      const np = { ...p };
      // ★ 事業所側で削除済み(墓石)の書類は、ケアマネ端末に残っていても再追加しない
      const _tomb = (p && p._delDocs && typeof p._delDocs === 'object') ? p._delDocs : {};
      const unionDocs = (key, incoming, label) => {
        if (!Array.isArray(incoming) || !incoming.length) return;
        const ex = Array.isArray(np[key]) ? np[key] : [];
        const ids = new Set(ex.map(d => String(d && d.id)));
        const add = incoming.filter(d => d && !ids.has(String(d.id)) && !_tomb[String(d.id)]);
        if (add.length) { np[key] = [...ex, ...add]; changed.push(label); }
      };
      unionDocs('docInsurance', patch.docInsurance, '介護保険証');
      unionDocs('docBurden', patch.docBurden, '負担割合証');
      // 保険証・負担割合証の内容(介護度/認定有効期間/負担割合)を利用者マスタへ反映。 値変更は変更履歴にも記録。
      const m = patch.master || {};
      const nowDay = now.split('T')[0];
      // ★ App.jsx の appendValueHistory と同じ規則: 値の変更に加え、値が同じでも認定有効期間の
      //   開始日が変わったら「認定更新」として1件残す(prevFrom を渡した時のみ判定)。
      const appendHist = (histKey, oldVal, newVal, from, to, prevFrom) => {
        const hist = Array.isArray(np[histKey]) ? [...np[histKey]] : [];
        const nv = newVal == null ? '' : String(newVal);
        if (!nv) return hist;
        const f = from || nowDay;
        const last = hist.length ? hist[hist.length - 1] : null;
        const valChanged = String(oldVal || '') !== nv;
        const periodChanged = prevFrom !== undefined && String(prevFrom || '') !== String(from || '');
        if (last && String(last.value || '') === nv && String(last.from || '') === String(f)) {
          if (to && String(last.to || '') !== String(to)) hist[hist.length - 1] = { ...last, to };
          return hist;
        }
        if (!valChanged && !periodChanged) return hist;
        if (oldVal) {
          if (last && !last.to) hist[hist.length - 1] = { ...last, to: f };
          else if (!hist.length) hist.push({ value: oldVal, from: prevFrom || null, to: f, note: '' });
        }
        hist.push({ value: nv, from: f, to: to || null, note: valChanged ? '' : '認定更新' });
        return hist;
      };
      // 介護度: 値が変わった時、または 値は同じでも認定開始日が変わった時に履歴を残す
      const _mCl = (m.careLevel != null && m.careLevel !== '') ? String(m.careLevel) : String(np.careLevel || '');
      const _mClFrom = (m.careLevelFrom != null && m.careLevelFrom !== '') ? String(m.careLevelFrom) : (np.careLevelFrom || '');
      if (_mCl && (_mCl !== String(np.careLevel || '') || _mClFrom !== String(np.careLevelFrom || ''))) {
        np.careLevelHistory = appendHist('careLevelHistory', np.careLevel, _mCl, _mClFrom, (m.careLevelTo || np.careLevelTo), np.careLevelFrom);
        if (_mCl !== String(np.careLevel || '')) { np.careLevel = _mCl; changed.push('介護度'); }
      }
      if (m.careLevelFrom != null && m.careLevelFrom !== '' && String(m.careLevelFrom) !== String(np.careLevelFrom || '')) { np.careLevelFrom = String(m.careLevelFrom); changed.push('認定有効期間'); }
      if (m.careLevelTo != null && m.careLevelTo !== '' && String(m.careLevelTo) !== String(np.careLevelTo || '')) { np.careLevelTo = String(m.careLevelTo); changed.push('認定有効期間'); }
      if (m.costBurden != null && m.costBurden !== '' && String(m.costBurden) !== String(np.costBurden || '')) {
        np.costBurdenHistory = appendHist('costBurdenHistory', np.costBurden, m.costBurden, null, null);
        np.costBurden = String(m.costBurden); changed.push('負担割合');
      }
      const hasAsmtText = patch.assessmentText != null && String(patch.assessmentText) !== ((np.personalFile || {}).assessment || {}).text;
      const hasAsmtFiles = Array.isArray(patch.assessmentFiles) && patch.assessmentFiles.length;
      if (hasAsmtText || hasAsmtFiles) {
        const pf = np.personalFile || {};
        const asmt = { ...(pf.assessment || {}) };
        if (patch.assessmentText != null) asmt.text = String(patch.assessmentText);
        if (hasAsmtFiles) {
          const ex = Array.isArray(asmt.files) ? asmt.files : [];
          const ids = new Set(ex.map(d => String(d && d.id)));
          asmt.files = [...ex, ...patch.assessmentFiles.filter(d => d && !ids.has(String(d.id)))];
        }
        asmt.updatedAt = now; asmt.updatedBy = byName;
        np.personalFile = { ...pf, assessment: asmt };
        changed.push('アセスメントシート');
      }
      if (changed.length) {
        const items = [...new Set(changed)];
        const log = Array.isArray(np.docUpdates) ? np.docUpdates : [];
        // ★ 同 _duId が既存なら二重追加しない(応答ロス→再試行の冪等)
        np.docUpdates = log.some(u => u && u.id === _duId) ? log : [...log, { id: _duId, at: now, by: 'caremanager', byName, items, readOffice: false, readCm: true }].slice(-50);
      }
      return np;
    });
    if (!changed.length) return null; // 変更なし → 書き込まない(noop)
    return { ...currentData, patients };
}

export function portalMarkDocUpdatesRead(cloud, patientId, flag) {
      const currentData = cloud;
      if (!currentData) return null;
      let touched = false;
      const patients = (currentData.patients || []).map(p => {
        if (String(p.id) !== String(patientId)) return p;
        const log = Array.isArray(p.docUpdates) ? p.docUpdates : [];
        if (!log.some(u => !u[flag])) return p;
        touched = true;
        return { ...p, docUpdates: log.map(u => u[flag] ? u : { ...u, [flag]: true }) };
      });
      if (!touched) return null; // 既に全既読 → 書き込まない
      return { ...currentData, patients };
}

// ★ ポータルに渡す「その利用者の分だけ」の店舗データ。ご家族の端末に店舗全員のデータを届けない(データ保護 段階3.5)。
//   pids: 見てよい利用者ID(文字列)の一覧。systemSettings は画面に必要な項目だけ(管理者パスワード等は渡さない)。
export const PORTAL_SETTINGS_KEYS = ['facilityInfo', 'cmOffices', 'careManagers', 'policies']; // ポータル画面が参照する項目(2026-10-18 調査: facilityInfo/cmOffices/careManagers/policies)
export function portalSliceState(cloud, pids) {
  if (!cloud || typeof cloud !== 'object') return null;
  const allow = new Set((pids || []).map(String));
  const pick = (arr) => (Array.isArray(arr) ? arr : []).filter(x => x && allow.has(String(x.patientId != null ? x.patientId : x.pid)));
  const ss = cloud.systemSettings || {};
  const settings = {};
  PORTAL_SETTINGS_KEYS.forEach(k => { if (ss[k] !== undefined) settings[k] = ss[k]; });
  if (Array.isArray(settings.careManagers)) settings.careManagers = settings.careManagers.map(c => { const { _emailTs, ...r } = c || {}; return r; });
  return {
    patients: (cloud.patients || []).filter(p => p && allow.has(String(p.id))),
    systemSettings: settings,
    familyAnnouncements: Array.isArray(cloud.familyAnnouncements) ? cloud.familyAnnouncements : [],
    familyPersonalAnnouncements: pick(cloud.familyPersonalAnnouncements),
    familyPhotos: pick(cloud.familyPhotos),
    _lastSync: cloud._lastSync || null,
    __clock: cloud.__clock || 0,
  };
}
