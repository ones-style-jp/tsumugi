-- =============================================
-- Tsumugi 家族認証 最小スキーマ (Phase 1)
-- =============================================
-- 目的: 家族の「端末越しログイン」を可能にする
-- 範囲: family_accounts + family_invites のみ (利用者/事業所データは引き続き localStorage)
-- 認証: 独自テーブル (Supabase Auth は使わず、独自 username + password_hash)
-- RLS:  簡易運用なので anon キーで full CRUD (本格運用時に強化)
--
-- 実行手順:
-- 1. Supabase ダッシュボード → SQL Editor → このファイルを貼り付け → RUN
-- 2. エラーが出なければ完了
-- =============================================

create extension if not exists "pgcrypto";

-- family_accounts: 家族アカウント
create table if not exists public.family_accounts (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,                       -- localStorage の利用者 ID (text)
  username text unique not null,                  -- ログインID
  password_hash text not null,                    -- SHA-256 ハッシュ (簡易)
  kind text default 'family' check (kind in ('family','caremanager')),
  relation text,                                  -- 続柄
  display_name text,                              -- 表示名 (姓名)
  email text,
  -- 表示用に非正規化したコピー (利用者/事業所データは localStorage 側にあるため)
  facility_name text,
  patient_name text,
  role text default 'member' check (role in ('parent','member')),
  last_login timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
create index if not exists idx_fa_patient on public.family_accounts(patient_id) where deleted_at is null;
create index if not exists idx_fa_email on public.family_accounts(lower(email)) where deleted_at is null;

-- family_invites: 招待コード
create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  code text unique not null,                      -- FAM-XXXX-XXXX
  email text,                                     -- スタッフが入力したメアド
  relation text,                                  -- スタッフが入力した続柄
  -- 表示用 (家族側で利用者/事業所名を表示するため)
  facility_name text,
  patient_name text,
  facility_phone text,
  used_by uuid references public.family_accounts(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_fi_code on public.family_invites(code) where used_by is null;
create index if not exists idx_fi_patient on public.family_invites(patient_id);

-- RLS: anon キーで full CRUD (簡易運用)
-- 注意: 本格運用時には Supabase Auth + 適切なポリシーで強化すること
alter table public.family_accounts enable row level security;
alter table public.family_invites  enable row level security;

drop policy if exists "allow_all_family_accounts" on public.family_accounts;
drop policy if exists "allow_all_family_invites"  on public.family_invites;

create policy "allow_all_family_accounts" on public.family_accounts
  for all to anon, authenticated using (true) with check (true);
create policy "allow_all_family_invites" on public.family_invites
  for all to anon, authenticated using (true) with check (true);

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_fa_updated_at on public.family_accounts;
create trigger trg_fa_updated_at
  before update on public.family_accounts
  for each row execute function public.set_updated_at();

-- 確認
select 'family_accounts' as table_name, count(*) as rows from public.family_accounts
union all
select 'family_invites', count(*) from public.family_invites;
