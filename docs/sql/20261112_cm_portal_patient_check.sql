-- 2026-11-12 ケアマネ画面で「ある利用者の記録だけ更新されない／見られない」の確認(①〜⑥は見るだけ・何も書き換えません)
-- Supabase の SQL Editor で、上から 1 つずつ実行。先に 4 か所の <…> を書き換える(残しておくと 0 件になるだけ)。
--   <店舗キー>            … ① で調べる(例: store_xxx)
--   <利用者の名前の一部>   … 姓だけでよい(空白は半角・全角どちらでも拾う)
--   <ケアマネの名前の一部> … 姓だけでよい
--   <事業所名の一部>       … 居宅介護支援事業所の名前の一部
--
-- ★ 仕組み(2026-11-12 時点)
--   ・ケアマネのアカウント(family_accounts)は「担当する利用者 1 人につき 1 行」。
--     今の方式(2026-09〜): ケアマネ 1 人に ID・パスワード 1 組。ログインのたびに、利用者マスタの「ケアマネ事業所・担当者名」が
--     事業所マスタのその人と一致する利用者の分を自動で揃える(同じメール＋同じパスワードの行がひとまとまり)。
--     旧方式(それより前): 店舗が利用者 1 人ずつに ID・パスワードを作っていた。行ごとにパスワードが違い、メールや店舗の番号(store_id)が空のことがある。
--   ・2026-10-18(データ保護 段階3.5)から、ご家族・ケアマネ画面はサーバー経由(/api/portal)になり、ログイン時の「証」に
--     (店舗, 利用者番号)の組が入る。この組は【店舗の番号(store_id)が入っている行だけ】から作る。
--     → 旧方式の行で store_id が空だと、ログインはできるが店舗データも記録も取れず、端末に残っていた古い表示のまま更新されない。
--       「以前から使えていたのに、ある時期から 1 人だけ止まった」はこの形が最有力。
--   ・記録はテーブル ticket_records を利用者番号(patient_id)で絞って読む。店舗の画面は app_state の JSON を見る。
--
-- ★ 1 人だけ止まる原因の候補
--   A 旧方式の行: store_id が空／メールが空／今のログイン行とパスワードの組が違う(=証に入らない)
--   B その行が停止されている(deleted_at)
--   C 利用者マスタのケアマネの書き方が事業所マスタと一致しない(自動揃えの対象外・古い行だけ残る)
--   D 同じ名前で利用者番号が 2 つ(古い番号を指している)
--   E ticket_records の patient_id が空(番号に直せない値で書かれた)
--   F 全員止まるなら 1000 行の件(2026-10-05・安定版 1005d で修正済み)。1 人だけなら別

-- ① 店舗キーを調べる
select key as 店舗キー, data->'systemSettings'->'facilityInfo'->>'name' as 店舗名
  from app_state
 where key not like '\_\_%' and data ? 'patients'
 order by 2;

-- ② 利用者マスタ側: その利用者の番号・状態・ケアマネの書き方(同じ名前が 2 行出れば D)
select p->>'id' as 利用者番号, p->>'name' as 名前, p->>'status' as 状態, p->>'cmOffice' as ケアマネ事業所, p->>'cmName' as 担当者名
  from app_state a, jsonb_array_elements(a.data->'patients') p
 where a.key = '<店舗キー>'
   and replace(replace(p->>'name', ' ', ''), '　', '') like '%' || replace(replace('<利用者の名前の一部>', ' ', ''), '　', '') || '%';

-- ③ 事業所マスタ側: そのケアマネの登録(メールの有無・事業所名・担当者名の書き方)。② と空白まで含めて一致していなければ C
select c->>'office' as 事業所, c->>'name' as 担当者名, lower(c->>'email') as メール
  from app_state a, jsonb_array_elements(a.data->'systemSettings'->'careManagers') c
 where a.key = '<店舗キー>'
   and (replace(replace(c->>'name', ' ', ''), '　', '') like '%' || replace(replace('<ケアマネの名前の一部>', ' ', ''), '　', '') || '%'
        or c->>'office' like '%<事業所名の一部>%');

-- ④ ケアマネの行を広く拾う(今の方式の行も旧方式の行も)。見るところ:
--     「店舗なし」= A(証に入らない)   「停止」に日付 = B   「組」が 2 つ以上 = パスワードの違う行が混ざっている(旧方式の名残)
--     「マスタにない番号」= D の疑い   「メールなし」= 自動揃えの対象外
select id, username as ログインID, kind, relation as 続柄, display_name as 表示名, facility_name as 事業所, email as メール,
       store_id as 店舗, patient_id as 利用者番号, patient_name as 利用者名,
       deleted_at as 停止, last_login as 最終ログイン,
       dense_rank() over (order by coalesce(password_hash, '')) as 組,
       case when store_id is null then '店舗なし' else '' end as 店舗の状態,
       case when email is null or email = '' then 'メールなし' else '' end as メールの状態,
       case when not exists (select 1 from app_state a, jsonb_array_elements(a.data->'patients') p
                              where a.key = '<店舗キー>' and p->>'id' = patient_id::text) then 'マスタにない番号' else '' end as 番号の状態
  from family_accounts
 where (relation = 'ケアマネージャー' or kind = 'caremanager'
        or replace(replace(coalesce(display_name, ''), ' ', ''), '　', '') like '%' || replace(replace('<ケアマネの名前の一部>', ' ', ''), '　', '') || '%'
        or coalesce(facility_name, '') like '%<事業所名の一部>%')
   and (store_id = '<店舗キー>' or store_id is null
        or patient_id::text in (select p->>'id' from app_state a, jsonb_array_elements(a.data->'patients') p where a.key = '<店舗キー>'))
 order by 組, 停止 nulls first, 利用者番号;

-- ⑤ その利用者の番号を指している行(店舗を問わず)。ここに「店舗なし」「別の組」の行しか無ければ、今のログインではその方が見えない
select id, username as ログインID, kind, relation as 続柄, display_name as 表示名, email as メール, store_id as 店舗,
       patient_id as 利用者番号, patient_name as 利用者名, deleted_at as 停止, last_login as 最終ログイン,
       dense_rank() over (order by coalesce(password_hash, '')) as 組
  from family_accounts
 where patient_id::text in (select p->>'id' from app_state a, jsonb_array_elements(a.data->'patients') p
                             where a.key = '<店舗キー>'
                               and replace(replace(p->>'name', ' ', ''), '　', '') like '%' || replace(replace('<利用者の名前の一部>', ' ', ''), '　', '') || '%')
 order by 停止 nulls first, 最終ログイン desc nulls last;

-- ⑥ 記録側: その利用者の番号ごとの件数と最新(行数 0 や最新が古い番号があれば D・E)。あわせて店舗の番号が空の記録(E)
select t.patient_id as 利用者番号, count(*) filter (where t.deleted_at is null) as 件数, max(t.rec_date) as 最新の利用日, max(t.updated_at) as 最後に書いた時刻
  from ticket_records t
 where t.store_id = '<店舗キー>'
   and t.patient_id::text in (select p->>'id' from app_state a, jsonb_array_elements(a.data->'patients') p
                               where a.key = '<店舗キー>'
                                 and replace(replace(p->>'name', ' ', ''), '　', '') like '%' || replace(replace('<利用者の名前の一部>', ' ', ''), '　', '') || '%')
 group by 1 order by 1;

select t.data->>'patientId' as 記録の中の番号, count(*) as 件数, max(t.rec_date) as 最新の利用日
  from ticket_records t
 where t.store_id = '<店舗キー>' and t.patient_id is null and t.updated_at > now() - interval '90 days'
 group by 1 order by 2 desc;

-- ======================================================================================================
-- ★ 直し方(④⑤⑥の結果を見てから・1 つずつ実行。実行前に対象の id を④⑤で確かめる)
-- ======================================================================================================
-- A-1 旧方式の行に店舗の番号が無い → 店舗の番号を入れる(これだけで証に入り、次のログインから見える)
-- update family_accounts set store_id = '<店舗キー>' where id = '<④⑤で見た行の id>' and store_id is null;

-- A-2 旧方式の行が、今のログイン行と別の組(別パスワード・メール無し) → 今のログイン行と同じメール・パスワードにして 1 つにまとめる
--     (<今のログイン行の id> = ケアマネが今使っている ID の行。④で「最終ログイン」が新しい行)
-- update family_accounts
--    set email = (select email from family_accounts where id = '<今のログイン行の id>'),
--        password_hash = (select password_hash from family_accounts where id = '<今のログイン行の id>'),
--        kind = 'caremanager', relation = 'ケアマネージャー', store_id = '<店舗キー>', deleted_at = null
--  where id = '<古い行の id>';

-- B 停止されている → 戻す(C が原因なら先に C を直す。直さないと次のログインでまた停止される)
-- update family_accounts set deleted_at = null where id = '<行の id>';

-- C 利用者マスタのケアマネの書き方のずれ → SQL ではなく店舗の画面で: 利用者マスタ → その方 → ケアマネ事業所・担当者名を選び直して保存
--   → ケアマネに一度ログアウト→ログインしてもらう(自動で行が揃う)

-- D 古い番号を指している → 今の番号に付け替える(② の番号)
-- update family_accounts set patient_id = '<今の利用者番号>', patient_name = '<名前>' where id = '<行の id>';

-- E 記録の番号が空 → 記録の中の番号から入れ直す
-- update ticket_records set patient_id = (data->>'patientId')::int
--  where store_id = '<店舗キー>' and patient_id is null and data->>'patientId' ~ '^\d+$';

-- ★ 直したあと: ケアマネに「ログアウト → ログイン」をしてもらう(証を取り直す)。それでも古いままなら、ブラウザのそのサイトのデータを消して開き直す。
