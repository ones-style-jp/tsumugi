-- 2026-11-04 江古田店 担当職員の復旧(版2): 名簿が変わったのは 11/4 16:05〜16:50。16:05 の控え(id 15406)を基準にする。
-- 消えた方は いつまで=11/3 で戻す・新しい行は いつから=11/4・同じ行のまま役職が変わった方は 11/3 までの前の役職を履歴に付ける。
-- 退避: create table if not exists app_state_rescue_20261104b as select * from app_state;
-- ② 見るだけ
with tgt as (select a.key from app_state a where a.data->'systemSettings'->'facilityInfo'->>'name' like '%江古田%'),
snap as (select s.data from app_state_snapshots s join tgt on s.key = tgt.key where s.id = 15406),
before as (select x from snap, jsonb_array_elements(snap.data->'diarySettings'->'staff') x where coalesce(x->>'_tempHelp','') = ''),
nowl as (select x from app_state a join tgt on a.key = tgt.key, jsonb_array_elements(a.data->'diarySettings'->'staff') x where coalesce(x->>'_tempHelp','') = '')
select '戻す（いつまで 11/3）' as 扱い, b.x->>'name' as 氏名, b.x->>'role' as 役職 from before b where not exists (select 1 from nowl n where n.x->>'id' = b.x->>'id')
union all
select '新しい行（いつから 11/4）', n.x->>'name', n.x->>'role' from nowl n where not exists (select 1 from before b where b.x->>'id' = n.x->>'id')
union all
select '役職の履歴を付ける（11/3まで ' || (b.x->>'role') || '）', n.x->>'name', n.x->>'role' from nowl n join before b on b.x->>'id' = n.x->>'id'
 where coalesce(b.x->>'role','') <> coalesce(n.x->>'role','') or coalesce(b.x->>'role2','') <> coalesce(n.x->>'role2','');
-- ③ 書き戻す
with tgt as (select a.key from app_state a where a.data->'systemSettings'->'facilityInfo'->>'name' like '%江古田%'),
snap as (select s.data->'diarySettings'->'staff' as st from app_state_snapshots s join tgt on s.key = tgt.key where s.id = 15406),
cur as (select a.key, a.data->'diarySettings'->'staff' as st from app_state a join tgt on a.key = tgt.key),
newst as (
  select cur.key,
         coalesce((select jsonb_agg(
                     case
                       when coalesce(c->>'_tempHelp','') <> '' then c
                       when b.x is null then (case when coalesce(c->>'_from','') = '' then c || jsonb_build_object('_from', '2026-11-04') else c end)
                       when coalesce(b.x->>'role','') <> coalesce(c->>'role','') or coalesce(b.x->>'role2','') <> coalesce(c->>'role2','')
                         then c || jsonb_build_object('_roles', coalesce(c->'_roles', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('until', '2026-11-03', 'role', coalesce(b.x->>'role',''), 'role2', coalesce(b.x->>'role2',''))))
                       else c end)
                     from jsonb_array_elements(cur.st) c
                     left join lateral (select x from snap, jsonb_array_elements(snap.st) x where x->>'id' = c->>'id' limit 1) b on true), '[]'::jsonb)
         || coalesce((select jsonb_agg(x || jsonb_build_object('_to', '2026-11-03'))
                        from snap, jsonb_array_elements(snap.st) x
                       where coalesce(x->>'_tempHelp','') = ''
                         and not exists (select 1 from jsonb_array_elements(cur.st) c where c->>'id' = x->>'id')), '[]'::jsonb) as st
    from cur)
update app_state a
   set data = jsonb_set(a.data, '{diarySettings,staff}', n.st), version = coalesce(a.version, 0) + 1
  from newst n
 where a.key = n.key
returning a.key, jsonb_array_length(a.data->'diarySettings'->'staff') as 職員の行数, a.version;
-- ④ 確認
select x->>'name' as 氏名, x->>'role' as 役職, x->>'_from' as いつから, x->>'_to' as いつまで, x->'_roles' as 前の役職
  from app_state a, jsonb_array_elements(a.data->'diarySettings'->'staff') x
 where a.data->'systemSettings'->'facilityInfo'->>'name' like '%江古田%'
 order by x->>'role', x->>'name';
