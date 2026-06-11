-- =============================================
-- Tsumugi マルチテナント拡張 (Phase 2)
-- =============================================
-- 目的: 1 つの Supabase プロジェクトで複数の事業所 (店舗) を運用
-- 構成:
--   stores      - 店舗マスタ
--   staff       - スタッフアカウント (super_admin / manager / staff)
--   app_state   - 店舗ごとに JSON ブロブを保存 (既存の app_state を拡張)
--   family_*    - 既存テーブルに store_id 列を追加 (任意)
-- =============================================

create extension if not exists "pgcrypto";

-- =========================================================
-- 1. stores (店舗マスタ)
-- =========================================================
create table if not exists public.stores (
  id text primary key,                             -- 'store_扇橋' のような text ID (UI で扱いやすく)
  name text not null,                              -- 'ひかりデイサービス扇橋店'
  short_name text,                                 -- '扇橋店'
  org_name text,                                   -- 法人名 'ワンズスタイル株式会社'
  address text,
  phone text,
  fax text,
  email text,
  status text default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_stores_status on public.stores(status);

-- =========================================================
-- 2. staff (スタッフアカウント)
-- =========================================================
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  store_id text references public.stores(id) on delete cascade,  -- NULL = 本部管理者 (super_admin)
  username text unique not null,                                 -- ログインID
  password_hash text not null,                                   -- SHA-256 ハッシュ
  role text not null default 'staff' check (role in ('super_admin','manager','staff')),
  last_name text,
  first_name text,
  display_name text generated always as (coalesce(last_name||' '||first_name, last_name, first_name)) stored,
  email text,
  phone text,
  is_active boolean default true,
  last_login timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  -- super_admin は store_id NULL、それ以外は店舗必須
  constraint chk_staff_store_consistency check (
    (role = 'super_admin') or (store_id is not null)
  )
);
create index if not exists idx_staff_store on public.staff(store_id) where deleted_at is null;
create index if not exists idx_staff_username on public.staff(lower(username)) where deleted_at is null;
create index if not exists idx_staff_role on public.staff(role) where deleted_at is null;

-- =========================================================
-- 3. app_state は既に作成済み — store_id ごとに別行で保存
-- key = store_id を入れて使う (key='default' は廃止予定だが互換のため残す)
-- =========================================================
-- 既存の app_state には変更不要 (key 列にそのまま store_id 文字列を入れるだけ)

-- =========================================================
-- 4. family_accounts / family_invites に store_id 列 (任意)
-- =========================================================
alter table public.family_accounts add column if not exists store_id text references public.stores(id) on delete set null;
alter table public.family_invites  add column if not exists store_id text references public.stores(id) on delete set null;
create index if not exists idx_fa_store on public.family_accounts(store_id);
create index if not exists idx_fi_store on public.family_invites(store_id);

-- =========================================================
-- 5. RLS (簡易運用): anon でフル CRUD は維持
-- (本格運用時に staff の JWT で店舗フィルタを強制する)
-- =========================================================
alter table public.stores enable row level security;
alter table public.staff  enable row level security;

drop policy if exists "allow_all_stores" on public.stores;
drop policy if exists "allow_all_staff"  on public.staff;

create policy "allow_all_stores" on public.stores
  for all to anon, authenticated using (true) with check (true);
create policy "allow_all_staff" on public.staff
  for all to anon, authenticated using (true) with check (true);

-- =========================================================
-- 6. updated_at トリガー
-- =========================================================
create or replace function public.set_updated_at_generic()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_stores_updated on public.stores;
create trigger trg_stores_updated before update on public.stores
  for each row execute function public.set_updated_at_generic();

drop trigger if exists trg_staff_updated on public.staff;
create trigger trg_staff_updated before update on public.staff
  for each row execute function public.set_updated_at_generic();

-- =========================================================
-- 7. 初期データ: 本部管理者 + 1 店舗目 (扇橋店) を作成
--    パスワードは仮で 'tsumugi2026!' → 初回ログイン後に変更推奨
--    SHA-256(salt='tsumugi_v1_' + 'tsumugi2026!') の結果をセット
-- =========================================================
insert into public.stores (id, name, short_name, org_name, status)
values
  ('store_ougibashi', 'ひかりデイサービス扇橋店', '扇橋店', 'ワンズスタイル株式会社', 'active')
on conflict (id) do nothing;

-- 本部管理者 (super_admin) — masabou さん用
-- 初期パスワード: tsumugi2026!
-- SHA-256(tsumugi_v1_tsumugi2026!) を事前計算:
insert into public.staff (store_id, username, password_hash, role, last_name, first_name, email)
values
  (NULL, 'admin', encode(digest('tsumugi_v1_tsumugi2026!','sha256'),'hex'),
   'super_admin', '本部', '管理者', 'honbu@ones-style.co.jp')
on conflict (username) do nothing;

-- 扇橋店 manager — 初期パスワード: ougibashi2026!
insert into public.staff (store_id, username, password_hash, role, last_name, first_name)
values
  ('store_ougibashi', 'ougibashi_admin', encode(digest('tsumugi_v1_ougibashi2026!','sha256'),'hex'),
   'manager', '管理者', '扇橋')
on conflict (username) do nothing;

-- =========================================================
-- 確認
-- =========================================================
select 'stores' as name, count(*) as rows from public.stores
union all
select 'staff', count(*) from public.staff
union all
select 'app_state', count(*) from public.app_state;
