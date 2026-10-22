-- つむぎ: 他店の記録の写し(53件)を消したのを元に戻す (2026-10-22)
-- ★ remove_cross_store_records_2026-10-22.sql の ② を元に戻すときだけ使います。ふだんは使いません。
-- 実行場所: Supabase ダッシュボード → SQL Editor → 貼り付けて Run
--
-- ★ 戻すもの: 2026-10-22 以降に消された記録のうち、消すときと同じ条件(お名前が今の店舗の同じ番号の方と違う
--   ＋ 別の店舗に同じ番号・同じお名前の方がいる ＋ その店舗に同じ記録番号がある)に当たるものだけ。
--   アプリでふだん消した記録(振替の取り消しなど)は、お名前が同じ方なので当たりません。
--   戻すのは 1〜53件のときだけ(それ以外は何も変えずに0件で終わります)。端末には差分受信でまた出ます。

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
  where t.deleted_at >= timestamptz '2026-10-22 00:00:00+09'
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
   set deleted_at = null, updated_at = now()
  from sus, guard
 where guard.n between 1 and 53
   and t.store_id = sus.store_id and t.id = sus.id
returning t.store_id, t.id;
