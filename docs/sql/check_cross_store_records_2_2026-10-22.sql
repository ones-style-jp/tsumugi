-- つむぎ: 他店の記録の残り(53件)をくわしく調べる 2本目 (2026-10-22)
-- ★ 読むだけです。データは一切変えません。結果に出るのは店舗・件数・年月だけです(お名前・記録の中身は出ません)。
-- 実行場所: Supabase ダッシュボード → SQL Editor → 新しいタブに貼り付けて Run
--
-- 1本目(check_cross_store_records_2026-10-22.sql)の結果: other_store_match = 江古田4・東小岩5・南水元32・西馬込12(すべて日付の列が空=8/10の表への移し替えより前の記録)
--
-- ★ 列の意味
--   store_id            … 今その記録が入っている店舗
--   src_store           … 同じ番号・同じお名前の方がいる別の店舗(= 記録の元の店舗とみられる)
--   n                   … 件数
--   same_id_in_src      … 元の店舗にも「同じ記録番号」の記録がある件数(= 写しであることが確実)
--   same_day_in_src     … 元の店舗に「同じ方・同じ日付」の記録がある件数
--   own_same_day        … 今の店舗に、同じ番号の方の「同じ日付」の別の記録がある件数(画面でどちらが出るか紛れる)
--   with_vitals         … 体温・血圧の値が入っている件数
--   months              … 記録の日付の月(例: 7月,8月)
--   years               … 記録に入っている年(空は年なし)

with pats as (
  select s.key as store_id,
         (p->>'id') as pid,
         regexp_replace(coalesce(p->>'name', ''), '[[:space:]　]', '', 'g') as pname
  from public.app_state s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'patients') = 'array' then s.data->'patients' else '[]'::jsonb end
  ) p
),
recs as (
  select t.store_id, t.id,
         t.patient_id::text as pid,
         regexp_replace(coalesce(t.data->>'name', ''), '[[:space:]　]', '', 'g') as rname,
         coalesce(t.data->>'date', '') as dstr,
         coalesce(t.data->>'year', '') as ystr,
         (coalesce(t.data->>'temp_AM', '') || coalesce(t.data->>'temp_PM', '') || coalesce(t.data->>'temp', '')
          || coalesce(t.data->>'bpUpSt_AM', '') || coalesce(t.data->>'bpUpSt_PM', '') || coalesce(t.data->>'bpUpSt', '')) <> '' as vitals
  from public.ticket_records t
  where t.deleted_at is null
),
sus as (
  select distinct on (r.store_id, r.id) r.*, p2.store_id as src_store
  from recs r
  join pats pa on pa.store_id = r.store_id and pa.pid = r.pid
  join pats p2 on p2.store_id <> r.store_id and p2.pid = r.pid and p2.pname = r.rname
  where r.rname <> '' and pa.pname <> '' and r.rname <> pa.pname
  order by r.store_id, r.id, p2.store_id
)
select s.store_id,
       s.src_store,
       count(*) as n,
       count(*) filter (where exists (select 1 from public.ticket_records t2 where t2.store_id = s.src_store and t2.id = s.id)) as same_id_in_src,
       count(*) filter (where exists (select 1 from recs o where o.store_id = s.src_store and o.pid = s.pid and o.dstr = s.dstr and o.ystr = s.ystr)) as same_day_in_src,
       count(*) filter (where exists (select 1 from recs o where o.store_id = s.store_id and o.pid = s.pid and o.dstr = s.dstr and o.id <> s.id)) as own_same_day,
       count(*) filter (where s.vitals) as with_vitals,
       string_agg(distinct nullif(split_part(s.dstr, '月', 1), '') || '月', ',') as months,
       string_agg(distinct coalesce(nullif(s.ystr, ''), '年なし'), ',') as years
from sus s
group by 1, 2
order by 1, 2;
