-- つむぎ: 他店の記録の写し(53件)を消す (2026-10-22)
-- ★ データを変えます。上から順に、①だけ → 結果を確かめてから ② の順で Run してください(一度に全部は流さない)。
-- 実行場所: Supabase ダッシュボード → SQL Editor → 新しいタブに貼り付けて、実行したい部分だけを選んで Run
-- 戻し方: remove_cross_store_records_2026-10-22_rollback.sql(消した53件だけを元に戻す)
--
-- ★ 消すもの(1本目・2本目の SQL で確かめた53件)
--   江古田4・東小岩5(扇橋から)／南水元32(扇橋26・東小岩4・江古田1・西馬込1)／西馬込12(扇橋から)
--   条件: 記録のお名前が今の店舗の同じ番号の方と違う ＋ 別の店舗に同じ番号・同じお名前の方がいる
--         ＋ その別の店舗に「同じ記録番号」の記録がある(= 写しであることが確実)
--   2本目の結果: 53件すべて元の店舗に写しあり・今の店舗に同じ日の本来の記録なし(6〜7月・2026年)
--
-- ★ 消し方: アプリで記録を消すときと同じ形(論理削除 deleted_at = now()・updated_at = now())。
--   元の店舗の記録には触りません。各店舗の端末は、いつもの差分受信(6秒ごと)で写しを画面から外します。
--   ② は、消す件数がちょうど53件のときだけ動きます(違うときは何も変えずに0件で終わります)。

-- =========================================================
-- ① 確かめるだけ(変えない): 消す予定の件数。53 になることを確かめる
-- =========================================================
with pats as (
  select s.key as store_id, (p->>'id') as pid,
         regexp_replace(coalesce(p->>'name', ''), '[[:space:]　]', '', 'g') as pname
  from public.app_state s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'patients') = 'array' then s.data->'patients' else '[]'::jsonb end
  ) p
),
recs as (
  select t.store_id, t.id, t.patient_id::text as pid,
         regexp_replace(coalesce(t.data->>'name', ''), '[[:space:]　]', '', 'g') as rname
  from public.ticket_records t
  where t.deleted_at is null
),
sus as (
  select distinct r.store_id, r.id
  from recs r
  join pats pa on pa.store_id = r.store_id and pa.pid = r.pid
  join pats p2 on p2.store_id <> r.store_id and p2.pid = r.pid and p2.pname = r.rname
  where r.rname <> '' and pa.pname <> '' and r.rname <> pa.pname
    and exists (select 1 from public.ticket_records t2 where t2.store_id = p2.store_id and t2.id = r.id)
)
select store_id, count(*) as n from sus group by 1
union all
select '合計', count(*) from sus
order by 1;

-- =========================================================
-- ② 消す(論理削除)。①の合計が 53 のときだけ実行してください。
--    結果に、消した記録の「店舗・記録番号」が並びます(53行)。
-- =========================================================
with pats as (
  select s.key as store_id, (p->>'id') as pid,
         regexp_replace(coalesce(p->>'name', ''), '[[:space:]　]', '', 'g') as pname
  from public.app_state s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'patients') = 'array' then s.data->'patients' else '[]'::jsonb end
  ) p
),
recs as (
  select t.store_id, t.id, t.patient_id::text as pid,
         regexp_replace(coalesce(t.data->>'name', ''), '[[:space:]　]', '', 'g') as rname
  from public.ticket_records t
  where t.deleted_at is null
),
sus as (
  select distinct r.store_id, r.id
  from recs r
  join pats pa on pa.store_id = r.store_id and pa.pid = r.pid
  join pats p2 on p2.store_id <> r.store_id and p2.pid = r.pid and p2.pname = r.rname
  where r.rname <> '' and pa.pname <> '' and r.rname <> pa.pname
    and exists (select 1 from public.ticket_records t2 where t2.store_id = p2.store_id and t2.id = r.id)
),
guard as (select count(*) as n from sus)
update public.ticket_records t
   set deleted_at = now(), updated_at = now()
  from sus, guard
 where guard.n = 53
   and t.store_id = sus.store_id and t.id = sus.id
   and t.deleted_at is null
returning t.store_id, t.id;
