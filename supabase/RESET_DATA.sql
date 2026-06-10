-- =============================================
-- Tsumugi 全データリセット (試験運用 START 前用)
-- =============================================
-- ⚠️ 実行すると以下が全て消えます:
--    - 全店舗の利用者・記録・お知らせ・メンバー (app_state)
--    - 全店舗の家族アカウント・家族招待
--    - 全店舗そのもの (stores テーブル)
--    - 全スタッフアカウント (staff テーブル)
-- ⚠️ 本部管理者アカウント (admin) と扇橋店初期データは SQL 後に
--    10_multi_tenant.sql の最後の方の insert 部分を再実行することで復活します。
-- =============================================

-- 1. 家族関連を消す
delete from public.family_invites;
delete from public.family_accounts;

-- 2. 店舗の app_state (全店舗のデータ) を消す
delete from public.app_state;

-- 3. 店舗のスタッフ (店舗管理者) を消す ※ super_admin (本部) は残す
delete from public.staff where role != 'super_admin';

-- 4. 店舗マスタを消す
delete from public.stores;

-- 5. app_state の初期行を再作成 (空の 'default' 行)
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
