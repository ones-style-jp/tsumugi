-- =============================================
-- Tsumugi スキーマ (01_schema.sql)
-- Supabase SQL Editor で上から順に実行
-- =============================================

-- =============================================
-- 0. 既存テーブルのクリーンアップ
-- =============================================
-- ⚠️ データがあれば失われます (初回セットアップ時のみ使用)
-- 既に運用中の場合は、このセクション全体をコメントアウトしてください
drop table if exists public.audit_logs            cascade;
drop table if exists public.family_read_status    cascade;
drop table if exists public.fax_history           cascade;
drop table if exists public.announcements         cascade;
drop table if exists public.contact_books         cascade;
drop table if exists public.daily_logs            cascade;
drop table if exists public.fitness_records       cascade;
drop table if exists public.monitoring_records    cascade;
drop table if exists public.ticket_records        cascade;
drop table if exists public.family_invites        cascade;
drop table if exists public.family_accounts       cascade;
drop table if exists public.emergency_contacts    cascade;
drop table if exists public.patients              cascade;
drop table if exists public.care_managers         cascade;
drop table if exists public.cm_offices            cascade;
drop table if exists public.staff                 cascade;
drop table if exists public.stores                cascade;

-- 既存のヘルパー関数も削除 (再作成のため)
drop function if exists public.set_updated_at()                                                    cascade;
drop function if exists public.current_user_store_id()                                             cascade;
drop function if exists public.is_admin()                                                          cascade;
drop function if exists public.is_staff()                                                          cascade;
drop function if exists public.current_family_patient_id()                                         cascade;
drop function if exists public.is_caremanager_account()                                            cascade;
drop function if exists public.verify_invite_code(text)                                            cascade;
drop function if exists public.consume_invite_and_create_family_account(text,uuid,text,text,text,text,text,text,text) cascade;
drop function if exists public.generate_family_invite(uuid)                                        cascade;

-- 拡張機能の有効化
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";  -- gen_random_uuid 用

-- =============================================
-- 1. 組織系
-- =============================================

-- 1.1 stores (事業所 / フランチャイズ各店)
create table public.stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null,                          -- ひかりデイサービス扇橋店
  short_name text,                             -- 扇橋店
  zip_code text,
  address text,
  phone text,
  fax text,
  email text,
  manager_name text,                           -- 管理者名 (表示用)
  service_time_am text,                        -- 9:00〜12:05
  service_time_pm text,                        -- 13:20〜16:25
  capacity int default 10,                     -- 定員
  closed_days int[] default array[0],          -- 定休日 [0:日,6:土]
  franchise_code text unique,                  -- ONES-DEMO-2026 等
  status text default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
create index idx_stores_status on public.stores(status) where deleted_at is null;

-- 1.2 staff (スタッフ)
create table public.staff (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,  -- Supabase Auth と紐付け
  last_name text,
  first_name text,
  full_name text generated always as (last_name || ' ' || first_name) stored,
  role text not null default 'staff' check (role in ('manager','staff','nurse','therapist','admin','part_time')),
  email text,
  phone text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
create index idx_staff_store on public.staff(store_id) where deleted_at is null;
create index idx_staff_user on public.staff(user_id);

-- 1.3 cm_offices (ケアマネ事業所)
create table public.cm_offices (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  phone text,
  fax text,
  address text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique (store_id, name)
);

-- 1.4 care_managers (ケアマネ担当者)
create table public.care_managers (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  office_id uuid references public.cm_offices(id) on delete set null,
  last_name text,
  first_name text,
  full_name text generated always as (last_name || ' ' || first_name) stored,
  phone text,                                  -- 事業所代表電話
  phone_direct text,                           -- 直通
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
create index idx_cm_office on public.care_managers(office_id);

-- =============================================
-- 2. 利用者系
-- =============================================

-- 2.1 patients (利用者)
create table public.patients (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,

  -- 基本情報
  name text not null,
  kana text,
  gender text check (gender in ('男性','女性','その他')),
  birth_date date,
  zip_code text,
  address text,
  phone text,

  -- 介護保険関連
  insurance_no text,                           -- 被保険者番号 10桁
  care_level text,                             -- 要支援1〜要介護5/事業対象者
  care_level_from date,                        -- 適用期間 開始
  care_level_to date,                          -- 適用期間 終了
  cost_burden text,                            -- 70%/80%/90%

  -- 健康情報
  kiou text,                                   -- 既往歴
  ryui text,                                   -- 留意点

  -- 利用情報
  start_date date,                             -- 利用開始日
  end_date date,                               -- 利用終了日
  status text default '利用中' check (status in ('利用中','休止','終了')),
  schedule_am_pm text[7],                      -- 曜日別 [日,月,火,水,木,金,土] AM/PM/1日/''
  pickup_times text[7],                        -- 曜日別お迎え時間 (HH:MM or HH:--)

  -- サービス内容
  massage_need text,                           -- 介護整体
  onyoku_denryo text,                          -- 温浴電療

  -- ケアマネ情報 (利用者ごとの担当)
  cm_office_id uuid references public.cm_offices(id) on delete set null,
  cm_manager_id uuid references public.care_managers(id) on delete set null,
  cm_office_name text,                         -- 履歴用に名前も保存
  cm_name text,
  cm_phone text,
  cm_fax text,

  -- 計画運動メニュー (JSONB で柔軟に)
  planned_exercises jsonb default '{}'::jsonb,
  individual_exercises jsonb,                  -- 個別運動の有効リスト

  -- フラグ
  auto_delete_after_5years boolean default false,

  -- 休止履歴
  pause_history jsonb default '[]'::jsonb,     -- [{reason, fromDate, toDate}]
  cost_burden_history jsonb default '[]'::jsonb,
  change_log jsonb default '[]'::jsonb,        -- 変更履歴
  cm_history jsonb default '[]'::jsonb,        -- ケアマネ変更履歴

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
create index idx_patients_store on public.patients(store_id) where deleted_at is null;
create index idx_patients_status on public.patients(store_id, status) where deleted_at is null;
create index idx_patients_kana on public.patients(store_id, kana);

-- 2.2 emergency_contacts (緊急連絡先)
create table public.emergency_contacts (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null,
  relation text,                               -- 続柄: 配偶者/長男/長女/...
  phone text,                                  -- 固定電話
  phone_mobile text,                           -- 携帯
  email text,
  added_by_family_account_id uuid,             -- 家族登録から追加された場合
  added_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_ec_patient on public.emergency_contacts(patient_id);

-- 2.3 family_accounts (家族アカウント)
create table public.family_accounts (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,  -- Supabase Auth 連携
  username text unique not null,               -- ログインID (旧式互換)
  password_hash text,                          -- 旧式互換 (新規はSupabase Auth)
  kind text default 'family' check (kind in ('family','caremanager')),
  relation text,                               -- 続柄
  display_name text,
  email text,
  last_login timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
create index idx_fa_patient on public.family_accounts(patient_id) where deleted_at is null;
create index idx_fa_user on public.family_accounts(user_id);

-- 2.4 family_invites (招待コード)
create table public.family_invites (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  code text unique not null,                   -- FAM-XXXX-XXXX
  used_by uuid references public.family_accounts(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz,                      -- 期限 (null = 期限なし)
  created_at timestamptz default now(),
  created_by uuid references public.staff(id) on delete set null
);
create index idx_invites_code on public.family_invites(code) where used_by is null;
create index idx_invites_patient on public.family_invites(patient_id);

-- =============================================
-- 3. 記録系
-- =============================================

-- 3.1 ticket_records (サービス提供記録) - 最頻出
create table public.ticket_records (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,

  -- 日付
  service_date date not null,                  -- 2026-06-07
  day_of_week text,                            -- 月/火/水...

  -- 状態
  status text not null check (status in ('出席','欠席','振替','休止','休業','臨時')),

  -- バイタル
  temp numeric(4,1),                           -- 体温 (36.5 等)
  bp_up_st int,                                -- 開始時血圧 上
  bp_dn_st int,                                -- 開始時血圧 下
  pl_st int,                                   -- 開始時脈拍
  bp_up_en int,
  bp_dn_en int,
  pl_en int,

  -- サービス
  massage text,                                -- 整体実施スタッフ
  exercises jsonb default '{}'::jsonb,         -- 運動メニュー実施 {u1:"○", heikobo:"10/20", ...}

  -- 気分
  kibun_arrival text check (kibun_arrival in (null,'excellent','good','normal','bad','terrible','')),
  kibun_arrival_reason text,
  kibun_departure text check (kibun_departure in (null,'excellent','good','normal','bad','terrible','')),
  kibun_departure_reason text,

  -- 特記
  tokki text,
  family_visible boolean default true,         -- 家族画面に表示するか
  family_override_text text,                   -- 家族向けに別文言を表示する場合

  -- フラグ
  done boolean default false,                  -- 確定済み

  -- 実施時刻
  actual_time text,

  -- メタ
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.staff(id),
  updated_by uuid references public.staff(id),

  unique (store_id, patient_id, service_date)  -- 同一利用者同一日は1件
);
create index idx_ticket_store_date on public.ticket_records(store_id, service_date desc);
create index idx_ticket_patient on public.ticket_records(patient_id, service_date desc);

-- 3.2 monitoring_records (モニタリング)
create table public.monitoring_records (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  monitoring_date date not null,
  data jsonb default '{}'::jsonb,              -- 柔軟な構造で保存
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.staff(id)
);
create index idx_mon_patient_date on public.monitoring_records(patient_id, monitoring_date desc);

-- 3.3 fitness_records (体力測定)
create table public.fitness_records (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  measurement_date date not null,
  values jsonb default '{}'::jsonb,            -- {height:175.2, weight:64.0, grip_r:11.8, ...}
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.staff(id)
);
create index idx_fit_patient_date on public.fitness_records(patient_id, measurement_date desc);

-- 3.4 daily_logs (日誌)
create table public.daily_logs (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  log_date date not null,
  am_pm text check (am_pm in ('AM','PM','1日')),
  data jsonb default '{}'::jsonb,              -- 担当職員/送迎/タイムスケジュール等
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.staff(id),
  unique (store_id, log_date, am_pm)
);
create index idx_log_store_date on public.daily_logs(store_id, log_date desc);

-- 3.5 contact_books (連絡帳)
create table public.contact_books (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  contact_date date not null,
  content text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.staff(id)
);
create index idx_cb_patient_date on public.contact_books(patient_id, contact_date desc);

-- =============================================
-- 4. コミュニケーション系
-- =============================================

-- 4.1 announcements (お知らせ)
create table public.announcements (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  scope text not null check (scope in ('all','specific')),  -- 全体 or 個別
  patient_id uuid references public.patients(id) on delete cascade,  -- specific時のみ
  title text,
  body text,
  service_date date,                           -- 表示用の日付
  posted_at timestamptz default now(),
  photos jsonb default '[]'::jsonb,            -- [{id, storage_path, name, caption}]
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.staff(id),
  deleted_at timestamptz
);
create index idx_ann_store_date on public.announcements(store_id, posted_at desc) where deleted_at is null;
create index idx_ann_patient on public.announcements(patient_id, posted_at desc) where deleted_at is null and patient_id is not null;

-- 4.2 fax_history (FAX 送付履歴)
create table public.fax_history (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  fax_type text not null check (fax_type in ('absence','general','ticket','other')),
  patient_id uuid references public.patients(id) on delete set null,
  patient_name text,                           -- 削除されても履歴保持
  subject text,
  recipient_name text,
  recipient_fax text,
  recipient_office text,
  note text,
  sent_at timestamptz default now(),
  created_at timestamptz default now(),
  created_by uuid references public.staff(id)
);
create index idx_fax_store_date on public.fax_history(store_id, sent_at desc);

-- =============================================
-- 5. 家族の既読管理 (お知らせ未読バッジ用)
-- =============================================
create table public.family_read_status (
  family_account_id uuid not null references public.family_accounts(id) on delete cascade,
  last_read_at timestamptz not null,
  primary key (family_account_id)
);

-- =============================================
-- 6. 監査ログ (重要操作の記録)
-- =============================================
create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,                        -- 'create','update','delete','login' 等
  target_table text,
  target_id uuid,
  changes jsonb,                               -- before/after
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);
create index idx_audit_store_date on public.audit_logs(store_id, created_at desc);

-- =============================================
-- 7. 自動更新トリガー (updated_at)
-- =============================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 各テーブルにトリガーを設定
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'stores','staff','cm_offices','care_managers',
      'patients','emergency_contacts','family_accounts',
      'ticket_records','monitoring_records','fitness_records',
      'daily_logs','contact_books','announcements'
    ])
  loop
    execute format('
      drop trigger if exists trg_%I_updated_at on public.%I;
      create trigger trg_%I_updated_at
        before update on public.%I
        for each row execute function public.set_updated_at();
    ', t, t, t, t);
  end loop;
end $$;

-- =============================================
-- 完了
-- =============================================
-- 次は 02_rls.sql を実行してください
