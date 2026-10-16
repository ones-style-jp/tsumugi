-- つむぎ データ保護(段階3の準備): 現状の棚卸し【読むだけ・何も変えない】 (2026-10-17)
-- 実行場所: Supabase ダッシュボード → SQL Editor → 貼り付けて Run
-- 結果(表)をコピーして Claude に渡してください。段階3の SQL(制限をかける・戻す)はこの結果を見て仕上げます。
--
-- 見るもの:
--   1) 対象テーブルの RLS(行単位の制限)が今どうなっているか
--   2) いま付いているポリシー(制限ルール)の一覧
--   3) ブラウザから呼ばれる関数(RPC)の定義 … security definer の関数は RLS をすり抜けるため、中に店舗の確認を足す必要がある
--   4) 対象テーブルの列(店舗IDの列名の確認)

-- 1) RLS の状態
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('app_state','ticket_records','sync_ops','undo_snapshots','stores','system_notices','staff','family_accounts','family_invites')
order by 1;

-- 2) ポリシーの一覧
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('app_state','ticket_records','sync_ops','undo_snapshots','stores','system_notices','staff','family_accounts','family_invites')
order by tablename, policyname;

-- 3) 関数の定義(ブラウザから呼ぶもの)
select p.proname as function_name,
       p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('upsert_ticket_records','delete_ticket_record','push_sync_ops','push_undo_snapshot','delete_undo_snapshot')
order by 1;

-- 4) 列の確認
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('app_state','ticket_records','sync_ops','undo_snapshots','stores','system_notices')
order by table_name, ordinal_position;

-- 5) (参考) 関数の実行権限
select p.proname, r.rolname as granted_to
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join lateral unnest(coalesce(p.proacl, acldefault('f', p.proowner))) as a
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and p.proname in ('upsert_ticket_records','delete_ticket_record','push_sync_ops','push_undo_snapshot','delete_undo_snapshot')
order by 1, 2;
