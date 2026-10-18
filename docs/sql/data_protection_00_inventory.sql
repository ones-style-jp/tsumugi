-- つむぎ データ保護(段階3の準備): 現状の棚卸し【読むだけ・何も変えない】 (2026-10-18 改: 1回の Run で1つの表が出る形)
-- 実行場所: Supabase ダッシュボード → SQL Editor → 全部貼り付けて Run → 出た表の上の「Export」→「Copy as Markdown」→ Claude に貼る
--
-- 見るもの(列 section で区別):
--   rls      対象テーブルの RLS(行単位の制限)が今どうなっているか
--   policy   いま付いているポリシー(制限ルール)
--   function ブラウザから呼ばれる関数(RPC)の定義 … security definer の関数は RLS をすり抜けるため、中に店舗の確認を足す必要がある
--   column   対象テーブルの列(店舗IDの列名の確認)
--   grant    関数の実行権限

with t as (
  select unnest(array['app_state','ticket_records','sync_ops','undo_snapshots','stores','system_notices','staff','family_accounts','family_invites']) as name
), f as (
  select unnest(array['upsert_ticket_records','delete_ticket_record','push_sync_ops','push_undo_snapshot','delete_undo_snapshot']) as name
)
select 'rls' as section, c.relname as name,
       ('enabled=' || c.relrowsecurity || ' forced=' || c.relforcerowsecurity) as detail
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (select name from t)

union all
select 'policy', tablename || ' / ' || policyname,
       ('roles=' || roles::text || ' cmd=' || cmd || ' using=' || coalesce(qual, '-') || ' check=' || coalesce(with_check, '-'))
from pg_policies
where schemaname = 'public' and tablename in (select name from t)

union all
select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       ('security_definer=' || p.prosecdef || E'\n' || pg_get_functiondef(p.oid))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (select name from f)

union all
select 'column', table_name, string_agg(column_name || ':' || data_type, ', ' order by ordinal_position)
from information_schema.columns
where table_schema = 'public' and table_name in (select name from t)
group by table_name

union all
select 'grant', p.proname, string_agg(coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ', ')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
left join pg_roles r on r.oid = a.grantee
where n.nspname = 'public' and p.proname in (select name from f)
group by p.proname

order by 1, 2;
