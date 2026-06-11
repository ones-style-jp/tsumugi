-- =============================================
-- Tsumugi 完全クリーンアップ (試験運用前の最終リセット)
-- =============================================
-- これを Supabase の SQL Editor で実行することで、
-- 過去テストで作成された 全店舗・全スタッフ・全家族アカウント・全招待を完全削除します。
-- ⚠️ 本部管理者 (super_admin) アカウントだけ残ります。
-- =============================================

-- 1. 家族関連を全削除
delete from public.family_invites;
delete from public.family_accounts;

-- 2. 店舗データを全削除
delete from public.app_state;

-- 3. 店舗スタッフを全削除 (本部 super_admin は除く)
delete from public.staff where role != 'super_admin';

-- 4. 店舗を全削除
delete from public.stores;

-- 5. app_state の初期行 (空) を再作成
insert into public.app_state (key, data) values ('default', '{}'::jsonb)
on conflict (key) do nothing;

-- 6. 確認
select 'stores' as table_name, count(*) as rows from public.stores
union all
select 'staff', count(*) from public.staff
union all
select 'family_accounts', count(*) from public.family_accounts
union all
select 'family_invites', count(*) from public.family_invites
union all
select 'app_state', count(*) from public.app_state;
