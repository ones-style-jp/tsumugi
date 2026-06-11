-- =============================================
-- 本部管理者の ID とパスワードを変更
-- =============================================
-- 新ID: tsumugikannri
-- 新PW: tsumugi001
-- パスワードは SHA-256 ('tsumugi_v1_' + パスワード) でハッシュ化される
-- =============================================

update public.staff
set
  username = 'tsumugikannri',
  password_hash = encode(digest('tsumugi_v1_tsumugi001', 'sha256'), 'hex')
where role = 'super_admin';

-- 確認
select id, username, role, last_name, first_name, created_at, last_login
from public.staff
where role = 'super_admin';
