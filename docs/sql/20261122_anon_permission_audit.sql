-- =====================================================================
-- つむぎ 権限の点検(読むだけ・2026-11-22)
--   目的: 公開の鍵(anon)と、ログインした利用者(authenticated)が、どの表を読める/書けるかを一覧にする。
--   データは変えない。結果を本部で確認し、不要な権限があれば別の SQL で閉じる。
-- =====================================================================

-- 1) 表ごとの権限(anon / authenticated)
select grantee, table_schema, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated')
group by grantee, table_schema, table_name
order by table_schema, table_name, grantee;

-- 2) RLS が有効かどうか(public の全表)
select n.nspname as schema, c.relname as table_name, c.relrowsecurity as rls_on, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 3) ポリシーの一覧(誰が・どの操作を・どの条件で)
select schemaname, tablename, policyname, roles, cmd, qual as using_expr, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by tablename, policyname;

-- 4) 関数(RPC)で anon が呼べるもの
select p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_can_execute,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- 5) 写真などの置き場(storage)のバケットが公開かどうか
select id, name, public, created_at from storage.buckets order by name;
