-- つむぎ: 提供記録の中に「同じ番号の別の方(別の店舗の方)」の記録が残っていないかを数える (2026-10-22)
-- ★ 読むだけです。データは一切変えません。
-- 実行場所: Supabase ダッシュボード → SQL Editor → 新しいタブに貼り付けて Run
-- 結果に出るのは「店舗・月・件数」だけです(お名前・記録の中身は出ません)。
--
-- ★ なぜ必要か
--   西馬込店の介護整体の「直近の実施」に、扇橋店の担当の7月の記録が出た(ユーザー報告 2026-10-22)。
--   利用者の番号(1,2,3…)は店舗の中だけの番号のため、以前の店舗切替の事故のころ(8月上旬)に
--   別の店舗の記録が同じ番号で紛れ込み、そのまま残っているとみられる。画面の表示は試験版 trial375・
--   安定版 1022d で直したが、記録そのものが何件残っているかはクラウドでしか数えられない。
--
-- ★ 列の意味
--   name_differs        … 記録のお名前が、その店舗の同じ番号の方のお名前と違う件数
--                          (お名前を後から直した方の古い記録も入るので、ここだけでは決めない)
--   other_store_match   … そのうち、別の店舗に「同じ番号・同じお名前」の方がいる件数
--                          (= 別の店舗の記録が紛れ込んだとみられる件数。ここが本命)
--   massage_not_in_list … 介護整体の担当が、その店舗の担当の一覧にいない件数(辞めた方の分も入る)
--   total               … その月の記録の件数(削除済みは除く)
--
-- ★ 結果の見方: other_store_match が 0 でない店舗・月があれば、その一覧(店舗・月・件数)を
--   Claude Code に渡してください。消す場合は「各種設定 → データ管理」の残骸の検査に
--   この判定を足して、店舗の画面から確認しながら消す方法を用意します(SQLで直接消すことはしません)。

with pats as (
  select s.key as store_id,
         (p->>'id') as pid,
         regexp_replace(coalesce(p->>'name', ''), '[[:space:]　]', '', 'g') as pname
  from public.app_state s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'patients') = 'array' then s.data->'patients' else '[]'::jsonb end
  ) p
),
staff as (
  select s.key as store_id, x.nm
  from public.app_state s
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(s.data->'systemSettings'->'massageStaff') = 'array'
         then s.data->'systemSettings'->'massageStaff' else '[]'::jsonb end
  ) as x(nm)
),
recs as (
  select t.store_id,
         t.patient_id::text as pid,
         t.rec_date,
         regexp_replace(coalesce(t.data->>'name', ''), '[[:space:]　]', '', 'g') as rname,
         coalesce(t.data->>'massage', '') as massage
  from public.ticket_records t
  where t.deleted_at is null
)
select r.store_id,
       to_char(r.rec_date, 'YYYY-MM') as month,
       count(*) filter (
         where pa.pid is not null and r.rname <> '' and pa.pname <> '' and r.rname <> pa.pname
       ) as name_differs,
       count(*) filter (
         where pa.pid is not null and r.rname <> '' and pa.pname <> '' and r.rname <> pa.pname
           and exists (select 1 from pats p2
                       where p2.store_id <> r.store_id and p2.pid = r.pid and p2.pname = r.rname)
       ) as other_store_match,
       count(*) filter (
         where r.massage <> ''
           and not exists (select 1 from staff st where st.store_id = r.store_id and st.nm = r.massage)
       ) as massage_not_in_list,
       count(*) as total
from recs r
left join pats pa on pa.store_id = r.store_id and pa.pid = r.pid
group by 1, 2
having count(*) filter (
         where pa.pid is not null and r.rname <> '' and pa.pname <> '' and r.rname <> pa.pname
       ) > 0
order by 1, 2;
