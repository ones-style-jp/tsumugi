-- 2026-11-12 ケアマネ画面で「ある利用者の記録だけ更新されない／見られない」の確認(見るだけ・何も書き換えません)
-- Supabase の SQL Editor で、上から 1 つずつ実行。先に 3 か所の <…> を書き換える。
--   <店舗キー>        … ① で調べる(例: store_xxx)
--   <ケアマネのメール> … 管理局 → 店舗 → ケアマネ事業所に登録しているメール(小文字)
--   <利用者の名前の一部> … 姓だけでよい(半角・全角の空白はどちらでも拾う)
--
-- ★ 仕組み(2026-11-12 時点)
--   ・ケアマネのアカウント(family_accounts・kind=caremanager)は「担当する利用者 1 人につき 1 行」。同じメール＋同じパスワードの行がひとまとまり。
--   ・どの利用者を担当とみなすかは、利用者マスタの「ケアマネ事業所」「担当者名」が、ケアマネ事業所マスタのその人と一致するかで決まる
--     (ログインのたびに自動で揃える: 増えた分は追加・外れた分は停止 deleted_at・番号が変わった分は付け替え)。
--   ・ケアマネ画面の提供記録は ticket_records の行を「見てよい利用者番号(patient_id)」で絞って読む。店舗の画面は app_state の JSON。
--     → ある利用者だけ止まる原因は、だいたい次のどれか:
--       A. その利用者の行が停止されている(deleted_at あり)／店舗の番号(store_id)が空／パスワードの組が違う行になっている
--       B. 利用者マスタのケアマネ事業所・担当者名の書き方が、ケアマネ事業所マスタと一致しなくなった(空白・表記ゆれ・事業所名の変更)
--       C. 利用者が 2 人いる(同じ名前で古い番号と新しい番号)。ケアマネの行が古い番号を指している
--       D. ticket_records の patient_id が空(番号に直せない値で書かれた)→ 画面には出るがケアマネには届かない
--       E. 過去の 1000 行の件(2026-10-05・安定版 1005d で修正済み)は全員に出るので、1 人だけなら別

-- ① 店舗キーを調べる
select key as 店舗キー, data->'systemSettings'->'facilityInfo'->>'name' as 店舗名
  from app_state
 where key not like '\_\_%' and data ? 'patients'
 order by 2;

-- ② そのケアマネの行(A の確認)。「組」が 2 つ以上あればパスワードの違う行が混ざっている。「停止」に日付がある行はケアマネからは見えない
select id, patient_id as 利用者番号, patient_name as 利用者名, username as ログインID, kind, store_id as 店舗,
       deleted_at as 停止, last_login as 最終ログイン,
       dense_rank() over (order by password_hash) as 組
  from family_accounts
 where lower(email) = lower('<ケアマネのメール>')
 order by 停止 nulls first, 利用者番号;

-- ③ 利用者マスタ側(B・C の確認)。同じ名前が 2 行出れば C。ケアマネ事業所・担当者名が ④ のマスタと一致していなければ B
select p->>'id' as 利用者番号, p->>'name' as 名前, p->>'status' as 状態, p->>'cmOffice' as ケアマネ事業所, p->>'cmName' as 担当者名,
       p->>'statusUpdatedAt' as 状態の更新
  from app_state a, jsonb_array_elements(a.data->'patients') p
 where a.key = '<店舗キー>'
   and replace(replace(p->>'name', ' ', ''), '　', '') like '%' || replace(replace('<利用者の名前の一部>', ' ', ''), '　', '') || '%';

-- ④ ケアマネ事業所マスタ側(B の確認)。③ の事業所・担当者名と、空白まで含めて一致しているか
select c->>'office' as 事業所, c->>'name' as 担当者名, lower(c->>'email') as メール
  from app_state a, jsonb_array_elements(a.data->'systemSettings'->'careManagers') c
 where a.key = '<店舗キー>'
   and (lower(c->>'email') = lower('<ケアマネのメール>') or c->>'office' in (select p->>'cmOffice' from app_state b, jsonb_array_elements(b.data->'patients') p where b.key = '<店舗キー>' and replace(replace(p->>'name',' ',''),'　','') like '%' || replace(replace('<利用者の名前の一部>',' ',''),'　','') || '%'));

-- ⑤ 記録側(C・D の確認)。② に出た利用者番号ごとに、テーブルにある件数と最新の日付。最新が古い番号があれば C、行数が 0 なら D や番号違い
select t.patient_id as 利用者番号, count(*) filter (where t.deleted_at is null) as 件数, max(t.rec_date) as 最新の利用日, max(t.updated_at) as 最後に書いた時刻
  from ticket_records t
 where t.store_id = '<店舗キー>'
   and t.patient_id in (select patient_id::int from family_accounts where lower(email) = lower('<ケアマネのメール>') and patient_id ~ '^\d+$')
 group by 1 order by 1;

-- ⑥ 店舗の番号が空の記録(D の確認)。直近 60 日で patient_id が空の行を、記録の中の patientId ごとに数える
select t.data->>'patientId' as 記録の中の番号, count(*) as 件数, max(t.rec_date) as 最新の利用日
  from ticket_records t
 where t.store_id = '<店舗キー>' and t.patient_id is null and t.updated_at > now() - interval '60 days'
 group by 1 order by 2 desc;

-- ⑦ 店舗の画面(app_state の JSON)にある、その利用者の直近の記録 5 件と、同じ id がテーブルにあるか
select r->>'id' as 記録id, r->>'date' as 利用日, r->>'patientId' as 番号,
       exists (select 1 from ticket_records t where t.store_id = '<店舗キー>' and t.id = r->>'id' and t.deleted_at is null) as テーブルにある
  from app_state a, jsonb_array_elements(a.data->'ticketRecords') r
 where a.key = '<店舗キー>'
   and r->>'patientId' in (select p->>'id' from app_state b, jsonb_array_elements(b.data->'patients') p where b.key = '<店舗キー>' and replace(replace(p->>'name',' ',''),'　','') like '%' || replace(replace('<利用者の名前の一部>',' ',''),'　','') || '%')
 order by r->>'date' desc limit 5;

-- ★ 直し方(結果を見てから・本部が実行)
--   A(停止されている)   : update family_accounts set deleted_at = null where id = '<②のid>';   ※ ただし B が原因なら先に B を直す(次のログインでまた停止される)
--   A(店舗が空)         : update family_accounts set store_id = '<店舗キー>' where id = '<②のid>';
--   B(表記ゆれ)         : 店舗の画面で 利用者マスタ → ケアマネ事業所・担当者名 を選び直して保存 → ケアマネに一度ログインし直してもらう(自動で揃う)
--   C(番号が 2 つ)      : 古い方を退所済みにする／統合(店舗と相談)。ケアマネの行は次のログインで新しい番号に付け替わる
--   D(patient_id が空) : update ticket_records set patient_id = (data->>'patientId')::int where store_id = '<店舗キー>' and patient_id is null and data->>'patientId' ~ '^\d+$';
