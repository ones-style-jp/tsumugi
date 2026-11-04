-- 2026-11-04 江古田店: 担当職員を削除・役職変更したことで、過去の日誌の担当職員と送迎表の運転者が見えなくなった件の復旧
-- 本部が Supabase の SQL Editor で、①〜④を上から1つずつ実行する。店舗での操作は不要。
-- 前提: 安定版 1104a(担当職員の「いつから・いつまで」を見る版)を先に配信し、江古田店の端末が 1104a になってから実行する。
--       古い版のままだと、戻した方が「今日の担当」にも出てしまう(壊れはしないが紛らわしい)。
-- 考え方: 変更は 11/4。11/4 の 0時より前の最後の控えにいた職員のうち、いまの一覧に居ない方(=消された方)を
--         「いつまで = 11/3」を付けて戻す。11/4 に新しく足した行には「いつから = 11/4」を付け、過去の日には出さない。
--         役職を変えた方(介護職員→生活相談員)は、元の介護職員の行が消され新しい行が足されているので、この2つで過去は介護職員・今日からは生活相談員になる。

-- ① 退避と、店舗・控えの確認(店舗が1行だけ出ることを確かめる)
create table if not exists app_state_rescue_20261104 as select * from app_state;
select a.key, a.data->'systemSettings'->'facilityInfo'->>'name' as 店舗名,
       (select s.id from app_state_snapshots s where s.key = a.key and s.taken_at < '2026-11-04 00:00+09' order by s.taken_at desc limit 1) as 控えのid,
       (select s.taken_at from app_state_snapshots s where s.key = a.key and s.taken_at < '2026-11-04 00:00+09' order by s.taken_at desc limit 1) as 控えの時刻
  from app_state a
 where a.data->'systemSettings'->'facilityInfo'->>'name' like '%江古田%';

-- ② 戻す職員と、いつからを付ける職員の一覧(まだ何も変えない・見るだけ)
with tgt as (select a.key from app_state a where a.data->'systemSettings'->'facilityInfo'->>'name' like '%江古田%'),
snap as (select s.data from app_state_snapshots s join tgt on s.key = tgt.key where s.taken_at < '2026-11-04 00:00+09' order by s.taken_at desc limit 1),
before as (select x from snap, jsonb_array_elements(snap.data->'diarySettings'->'staff') x),
nowl as (select x from app_state a join tgt on a.key = tgt.key, jsonb_array_elements(a.data->'diarySettings'->'staff') x)
select '戻す(いつまで 11/3)' as 扱い, b.x->>'name' as 氏名, b.x->>'role' as 役職 from before b where not exists (select 1 from nowl n where n.x->>'id' = b.x->>'id')
union all
select '新しい行(いつから 11/4)', n.x->>'name', n.x->>'role' from nowl n where not exists (select 1 from before b where b.x->>'id' = n.x->>'id') and coalesce(n.x->>'_tempHelp','') = '';

-- ③ 書き戻す(②の一覧が想定どおりのときだけ)。version を1つ進める(書き込み中の端末は取り直してから書く)
with tgt as (select a.key from app_state a where a.data->'systemSettings'->'facilityInfo'->>'name' like '%江古田%'),
snap as (select s.data from app_state_snapshots s join tgt on s.key = tgt.key where s.taken_at < '2026-11-04 00:00+09' order by s.taken_at desc limit 1),
cur as (select a.key, a.data->'diarySettings'->'staff' as st from app_state a join tgt on a.key = tgt.key),
newst as (
  select cur.key,
         coalesce((select jsonb_agg(case when not exists (select 1 from snap, jsonb_array_elements(snap.data->'diarySettings'->'staff') b where b->>'id' = c->>'id')
                                              and coalesce(c->>'_tempHelp','') = '' and coalesce(c->>'_from','') = ''
                                         then c || jsonb_build_object('_from', '2026-11-04') else c end)
                     from jsonb_array_elements(cur.st) c), '[]'::jsonb)
         || coalesce((select jsonb_agg(b || jsonb_build_object('_to', '2026-11-03'))
                        from snap, jsonb_array_elements(snap.data->'diarySettings'->'staff') b
                       where not exists (select 1 from jsonb_array_elements(cur.st) c where c->>'id' = b->>'id')), '[]'::jsonb) as st
    from cur)
update app_state a
   set data = jsonb_set(a.data, '{diarySettings,staff}', n.st), version = coalesce(a.version, 0) + 1
  from newst n
 where a.key = n.key
returning a.key, jsonb_array_length(a.data->'diarySettings'->'staff') as 職員の行数, a.version;

-- ④ 確認: 担当職員の一覧(戻した方に いつまで、新しい行に いつから が付いているか)
select x->>'name' as 氏名, x->>'role' as 役職, x->>'_from' as いつから, x->>'_to' as いつまで
  from app_state a, jsonb_array_elements(a.data->'diarySettings'->'staff') x
 where a.data->'systemSettings'->'facilityInfo'->>'name' like '%江古田%'
 order by x->>'role', x->>'name';

-- 実行後に確認すること: 江古田店の端末で、10月の日誌を開き、担当職員の生活相談員・介護職員の欄に前の方が出てチェックが付いていること。
--   今日の日誌では、外れた方が出ず、新しく相談員になった方が生活相談員の欄に出ること。
-- 戻すとき: update app_state a set data = r.data, version = a.version + 1 from app_state_rescue_20261104 r
--           where r.key = a.key and a.data->'systemSettings'->'facilityInfo'->>'name' like '%江古田%';
