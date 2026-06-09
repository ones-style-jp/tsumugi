-- =============================================
-- Tsumugi 全体データ同期テーブル (Phase 1.5)
-- =============================================
-- 目的: スタッフ画面の appData (利用者、お知らせ、記録など) を
--      家族画面に端末越しで反映させる
-- 設計: 単一事業所運用想定で、appData 全体を JSONB blob で保存
-- 認証: anon キーで full CRUD (簡易運用、本格運用時は強化)
-- =============================================

create extension if not exists "pgcrypto";

create table if not exists public.app_state (
  key text primary key,                            -- 'default' 固定 (将来 store_id に拡張)
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 初期行
insert into public.app_state (key, data) values ('default', '{}'::jsonb)
on conflict (key) do nothing;

-- RLS
alter table public.app_state enable row level security;

drop policy if exists "allow_all_app_state" on public.app_state;
create policy "allow_all_app_state" on public.app_state
  for all to anon, authenticated using (true) with check (true);

-- updated_at 自動更新
create or replace function public.set_app_state_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_app_state_updated_at on public.app_state;
create trigger trg_app_state_updated_at
  before update on public.app_state
  for each row execute function public.set_app_state_updated_at();

-- 確認
select 'app_state' as table_name, count(*) as rows, max(updated_at) as last_update from public.app_state;
