-- つむぎ: 他店の記録の写し(53件)を消す ②だけ (2026-10-22)
-- ★ データを変えます。①で合計53件と出たあとに、このファイルの中身をすべてコピーして SQL Editor の新しいタブに貼り、Run。
-- ★ 結果に「store_id・id」の行が53行並べば完了です。0行のときは件数が53件と違ったので、何も変えていません。
-- ★ 元に戻すとき: remove_cross_store_records_2026-10-22_rollback.sql
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
