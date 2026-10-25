-- つむぎ データ保護 段階4: 従業員ごとのログイン(本人アカウント・招待・PIN・ログイン記録) の土台 (2026-10-19)
-- 実行場所: Supabase ダッシュボード → SQL Editor → 全体を貼り付けて Run (1回だけ・いつでも実行可=追加だけで既存の動きは変わらない)
--
-- ★ 内容(すべて「追加」。既存の列・行・ポリシーは触らない)
--   1. staff に列を足す: member_id(店舗の職員一覧の id と紐づけ) / pin_hash(共有 iPad での切替用 PIN) / kind('store'=店舗共通 | 'person'=本人)
--   2. staff_invites: 従業員への招待コード(8桁・7日)。サーバー専用(RLS 有効・ポリシー無し=ブラウザからは見えない)
--   3. staff_logins: 誰がいつどの端末から入ったか(ログイン・PIN 切替)。サーバー専用
-- ★ 戻し: 下の「戻し方」を実行(列・表を消す)。

-- 1) staff の列
alter table public.staff add column if not exists member_id text;
alter table public.staff add column if not exists pin_hash text;
alter table public.staff add column if not exists kind text not null default 'store';
create index if not exists staff_store_member_idx on public.staff (store_id, member_id);

-- 2) 招待
create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  member_id text,
  name text,
  role text not null default 'member',
  email text,
  code text not null unique,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by uuid,
  used_at timestamptz
);
alter table public.staff_invites enable row level security;

-- 3) ログイン記録
create table if not exists public.staff_logins (
  id bigserial primary key,
  store_id text,
  staff_id uuid,
  member_id text,
  name text,
  kind text,            -- 'store' | 'person' | 'pin'
  device text,
  at timestamptz not null default now()
);
create index if not exists staff_logins_store_at_idx on public.staff_logins (store_id, at desc);
alter table public.staff_logins enable row level security;

-- 確認
--   select column_name from information_schema.columns where table_name='staff' and column_name in ('member_id','pin_hash','kind');
--   select count(*) from public.staff_invites; select count(*) from public.staff_logins;
--
-- 戻し方(段階4をやめるとき・データも消える):
--   drop table if exists public.staff_logins; drop table if exists public.staff_invites;
--   alter table public.staff drop column if exists member_id, drop column if exists pin_hash, drop column if exists kind;
