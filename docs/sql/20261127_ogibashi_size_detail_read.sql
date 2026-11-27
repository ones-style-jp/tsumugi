-- 2026-11-27 扇橋店の店舗データ「大きい項目の中身の内訳」の調べ(読むだけ・何も変えない)
--   ・すべて SELECT だけです。データは 1 文字も変わりません。version を上げる必要もありません。
--   ・出てくるのは「項目の名前(プログラム上の名前)」「大きさ(KB)」「件数」「年月」だけで、利用者の名前や記録の中身は出ません。
--   ・目的: 手順 1(11/27)で「各種設定 661 KB」「利用者 686 KB」が大きいと分かりました。その中の何が大きいかを見て、
--           店舗データを分けるとき「どこから外へ出すか」「消してよい残りが無いか」を決めます。
--   ・Supabase の SQL Editor に、手順ごとに貼って実行してください。結果は画面の写真か、結果の表の Export(CSV)でください。
--   ・店舗キーは扇橋店(store_ogibashi)を入れてあります。ほかの店舗を見るときは 'store_ogibashi' を置き換えます(各手順 1 か所)。

-- ────────────────────────────────────────────────────────────
-- 手順 4: 大きい項目の「中身の内訳」(1 つの表に A〜F をまとめて出します・70 行ほど)
--   A 各種設定(systemSettings)の中の項目 … kb=大きさ / n=件数(一覧のとき) / note=形
--   B 利用者 1 人ぶんの中の項目(全員の合計) … kb=全員の合計 / n=その項目を持つ人数 / note=1 人でいちばん大きい値
--   C 個人ファイル(personalFile)の中の項目(全員の合計) … 同上
--   D 日誌の 1 回ぶんの中の項目(全部の合計)
--   E 送迎表の 1 回ぶんの中の項目(全部の合計)
--   F 削除の印(deletedIds)の種類ごと … n=印の数
-- ────────────────────────────────────────────────────────────
with s as (select data from public.app_state where key = 'store_ogibashi')
select part, item, kb, n, note from (
  (select 'A 各種設定の中' as part, e.key as item,
          round(length(e.value::text) / 1024.0, 1) as kb,
          case jsonb_typeof(e.value)
            when 'array'  then jsonb_array_length(e.value)::bigint
            when 'object' then (select count(*) from jsonb_object_keys(e.value))
          end as n,
          jsonb_typeof(e.value) as note
   from s, jsonb_each(case when jsonb_typeof(s.data->'systemSettings') = 'object' then s.data->'systemSettings' else '{}'::jsonb end) e
   order by length(e.value::text) desc limit 15)
  union all
  (select 'B 利用者の中(全員の合計)', f.key,
          round(sum(length(f.value::text)) / 1024.0, 1), count(*),
          '1人で最大 ' || round(max(length(f.value::text)) / 1024.0, 1) || ' KB'
   from s,
        jsonb_array_elements(case when jsonb_typeof(s.data->'patients') = 'array' then s.data->'patients' else '[]'::jsonb end) p,
        jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) f
   group by f.key order by sum(length(f.value::text)) desc limit 20)
  union all
  (select 'C 個人ファイルの中(全員の合計)', f.key,
          round(sum(length(f.value::text)) / 1024.0, 1), count(*),
          '1人で最大 ' || round(max(length(f.value::text)) / 1024.0, 1) || ' KB'
   from s,
        jsonb_array_elements(case when jsonb_typeof(s.data->'patients') = 'array' then s.data->'patients' else '[]'::jsonb end) p,
        jsonb_each(case when jsonb_typeof(p->'personalFile') = 'object' then p->'personalFile' else '{}'::jsonb end) f
   group by f.key order by sum(length(f.value::text)) desc limit 12)
  union all
  (select 'D 日誌の中(全部の合計)', f.key,
          round(sum(length(f.value::text)) / 1024.0, 1), count(*),
          '1回で最大 ' || round(max(length(f.value::text)) / 1024.0, 1) || ' KB'
   from s,
        jsonb_each(case when jsonb_typeof(s.data->'diaryLogs') = 'object' then s.data->'diaryLogs' else '{}'::jsonb end) d,
        jsonb_each(case when jsonb_typeof(d.value) = 'object' then d.value else '{}'::jsonb end) f
   group by f.key order by sum(length(f.value::text)) desc limit 10)
  union all
  (select 'E 送迎表の中(全部の合計)', f.key,
          round(sum(length(f.value::text)) / 1024.0, 1), count(*),
          '1回で最大 ' || round(max(length(f.value::text)) / 1024.0, 1) || ' KB'
   from s,
        jsonb_each(case when jsonb_typeof(s.data->'transportPlans') = 'object' then s.data->'transportPlans' else '{}'::jsonb end) d,
        jsonb_each(case when jsonb_typeof(d.value) = 'object' then d.value else '{}'::jsonb end) f
   group by f.key order by sum(length(f.value::text)) desc limit 10)
  union all
  (select 'F 削除の印の種類', e.key,
          round(length(e.value::text) / 1024.0, 1),
          case when jsonb_typeof(e.value) = 'object' then (select count(*) from jsonb_object_keys(e.value)) end,
          jsonb_typeof(e.value)
   from s, jsonb_each(case when jsonb_typeof(s.data->'deletedIds') = 'object' then s.data->'deletedIds' else '{}'::jsonb end) e
   order by length(e.value::text) desc limit 25)
) t
order by part, kb desc;

-- ────────────────────────────────────────────────────────────
-- 手順 5: 日ごとに増える項目の「月ごとの大きさ」(日誌・送迎表・休み連絡)
--   見るところ: 古い月がどれだけ残っているか(=過去の月を店舗データの外へ出すと、どれだけ軽くなるか)。
--   month が 2099-01 の行は「基本の送迎表(ひな形)」です。過去の記録ではありません。
-- ────────────────────────────────────────────────────────────
with s as (select data from public.app_state where key = 'store_ogibashi')
select item, month, n, kb from (
  select '日誌(diaryLogs)' as item, left(e.key, 7) as month, count(*) as n,
         round(sum(length(e.value::text)) / 1024.0, 1) as kb
  from s, jsonb_each(case when jsonb_typeof(s.data->'diaryLogs') = 'object' then s.data->'diaryLogs' else '{}'::jsonb end) e
  group by left(e.key, 7)
  union all
  select '送迎表(transportPlans)', left(e.key, 7), count(*),
         round(sum(length(e.value::text)) / 1024.0, 1)
  from s, jsonb_each(case when jsonb_typeof(s.data->'transportPlans') = 'object' then s.data->'transportPlans' else '{}'::jsonb end) e
  group by left(e.key, 7)
  union all
  select '休み連絡(faxDataStore)', left(e.key, 7), count(*),
         round(sum(length(e.value::text)) / 1024.0, 1)
  from s, jsonb_each(case when jsonb_typeof(s.data->'faxDataStore') = 'object' then s.data->'faxDataStore' else '{}'::jsonb end) e
  group by left(e.key, 7)
) t
order by item, month;

-- ────────────────────────────────────────────────────────────
-- 手順 6: データベース側のいまの状態(店舗に関係なく 1 回だけ)
--   見るところ: 分ける先に使うテーブルがいまどうなっているか・店舗データに付いている仕掛け(トリガー)・控えの大きさ。
--   ここも読むだけです(テーブルの名前・列の名前・大きさだけ。中身は読みません)。
-- ────────────────────────────────────────────────────────────
select part, item, note from (
  select '1 テーブルの有無と大きさ' as part, c.relname::text as item,
         pg_size_pretty(pg_total_relation_size(c.oid)) || '・およそ ' || greatest(c.reltuples, 0)::bigint || ' 行・RLS ' ||
         case when c.relrowsecurity then '有効' else '無効' end as note
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname in ('app_state', 'store_records', 'state_head', 'ticket_records', 'ticket_records_history', 'app_state_snapshots', 'app_state_daily')
  union all
  select '2 store_records の列', column_name::text, data_type::text
  from information_schema.columns
  where table_schema = 'public' and table_name = 'store_records'
  union all
  select '3 store_records の決まり(ポリシー)', policyname::text, cmd::text
  from pg_policies
  where schemaname = 'public' and tablename = 'store_records'
  union all
  select '4 app_state の仕掛け(トリガー)', t.tgname::text,
         case when t.tgenabled = 'D' then '止まっている' else '動いている' end
  from pg_trigger t
  where t.tgrelid = 'public.app_state'::regclass and not t.tgisinternal
) x
order by part, item;
