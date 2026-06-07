-- =============================================
-- Tsumugi Row Level Security (02_rls.sql)
-- 事業所間のデータ隔離 + 家族・ケアマネの閲覧制限
-- =============================================

-- =============================================
-- ヘルパー関数
-- =============================================

-- 1. 現在ログイン中ユーザーの所属事業所IDを取得 (スタッフの場合)
create or replace function public.current_user_store_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select store_id from public.staff where user_id = auth.uid() and deleted_at is null limit 1
$$;

-- 2. 現在ログイン中ユーザーが店舗管理者か (店舗内の Owner 権限)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.staff
    where user_id = auth.uid()
      and role = 'manager'
      and deleted_at is null
  )
$$;

-- 2-b. 現在ログイン中ユーザーがシステム管理者(本部) か
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.staff
    where user_id = auth.uid()
      and is_super_admin = true
      and deleted_at is null
  )
$$;

-- 3. 現在ログイン中ユーザーがスタッフか (システム管理者も含む)
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from public.staff where user_id = auth.uid() and deleted_at is null)
$$;

-- 4. 現在ログイン中ユーザーが家族アカウントか + 関連する patient_id を取得
create or replace function public.current_family_patient_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select patient_id from public.family_accounts
  where user_id = auth.uid() and deleted_at is null
  limit 1
$$;

-- 5. 現在ログイン中ユーザーがケアマネ家族アカウントか
create or replace function public.is_caremanager_account()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.family_accounts
    where user_id = auth.uid()
      and kind = 'caremanager'
      and deleted_at is null
  )
$$;

-- =============================================
-- RLS 有効化
-- =============================================
alter table public.stores                enable row level security;
alter table public.staff                 enable row level security;
alter table public.cm_offices            enable row level security;
alter table public.care_managers         enable row level security;
alter table public.patients              enable row level security;
alter table public.emergency_contacts    enable row level security;
alter table public.family_accounts       enable row level security;
alter table public.family_invites        enable row level security;
alter table public.ticket_records        enable row level security;
alter table public.monitoring_records    enable row level security;
alter table public.fitness_records       enable row level security;
alter table public.daily_logs            enable row level security;
alter table public.contact_books         enable row level security;
alter table public.announcements         enable row level security;
alter table public.fax_history           enable row level security;
alter table public.family_read_status    enable row level security;
alter table public.audit_logs            enable row level security;

-- =============================================
-- 1. stores ポリシー
-- =============================================
-- スタッフは自分の事業所を見られる / システム管理者は全事業所閲覧
create policy "staff_view_own_store" on public.stores
  for select using (
    public.is_super_admin()
    or id = public.current_user_store_id()
  );

-- システム管理者または店舗管理者が更新可能
create policy "admin_update_store" on public.stores
  for update using (
    public.is_super_admin()
    or (public.is_admin() and id = public.current_user_store_id())
  );

-- システム管理者のみ事業所を新規作成・削除可能
create policy "super_admin_insert_store" on public.stores
  for insert with check (public.is_super_admin());
create policy "super_admin_delete_store" on public.stores
  for delete using (public.is_super_admin());

-- =============================================
-- 2. staff ポリシー
-- =============================================
-- 自分の事業所のスタッフ一覧を閲覧 / システム管理者は全員閲覧
create policy "staff_view_same_store" on public.staff
  for select using (
    public.is_super_admin()
    or store_id = public.current_user_store_id()
    or public.is_admin()
  );

-- 店舗管理者は自店のスタッフ管理可 / システム管理者は全スタッフ管理可
create policy "admin_manage_staff" on public.staff
  for all using (
    public.is_super_admin()
    or (public.is_admin() and store_id = public.current_user_store_id())
  )
  with check (
    public.is_super_admin()
    or store_id = public.current_user_store_id()
  );

-- =============================================
-- 3. cm_offices / care_managers ポリシー
-- =============================================
create policy "staff_view_cm_offices" on public.cm_offices
  for select using (public.is_super_admin() or store_id = public.current_user_store_id());
create policy "staff_manage_cm_offices" on public.cm_offices
  for all using (
    public.is_super_admin()
    or (public.is_staff() and store_id = public.current_user_store_id())
  )
  with check (public.is_super_admin() or store_id = public.current_user_store_id());

create policy "staff_view_cm_managers" on public.care_managers
  for select using (public.is_super_admin() or store_id = public.current_user_store_id());
create policy "staff_manage_cm_managers" on public.care_managers
  for all using (
    public.is_super_admin()
    or (public.is_staff() and store_id = public.current_user_store_id())
  )
  with check (public.is_super_admin() or store_id = public.current_user_store_id());

-- =============================================
-- 4. patients ポリシー
-- =============================================
-- スタッフ: 自店の利用者全員
-- システム管理者: 全店舗の利用者
-- 家族: 自分の患者だけ
create policy "staff_view_patients" on public.patients
  for select using (
    public.is_super_admin()
    or store_id = public.current_user_store_id()
  );
create policy "family_view_own_patient" on public.patients
  for select using (id = public.current_family_patient_id());

-- スタッフ: 自店の利用者を管理 / システム管理者: 全店舗の利用者を管理
create policy "staff_manage_patients" on public.patients
  for all using (
    public.is_super_admin()
    or (public.is_staff() and store_id = public.current_user_store_id())
  )
  with check (public.is_super_admin() or store_id = public.current_user_store_id());

-- =============================================
-- 5. emergency_contacts ポリシー
-- =============================================
-- スタッフ: 自店の利用者の緊急連絡先 / システム管理者: 全店
-- 家族: 自分の家族登録のうち、自分の追加分
create policy "staff_view_ec" on public.emergency_contacts
  for select using (
    public.is_super_admin()
    or exists(select 1 from public.patients p
      where p.id = patient_id and p.store_id = public.current_user_store_id())
  );

create policy "family_view_ec" on public.emergency_contacts
  for select using (patient_id = public.current_family_patient_id());

create policy "family_insert_own_ec" on public.emergency_contacts
  for insert with check (patient_id = public.current_family_patient_id());

create policy "staff_manage_ec" on public.emergency_contacts
  for all using (
    public.is_super_admin()
    or (public.is_staff() and exists(
      select 1 from public.patients p
      where p.id = patient_id and p.store_id = public.current_user_store_id()
    ))
  );

-- =============================================
-- 6. family_accounts ポリシー
-- =============================================
-- スタッフ: 自店利用者の家族アカウント / システム管理者: 全店
-- 家族: 自分のアカウントのみ
create policy "staff_view_fa" on public.family_accounts
  for select using (
    public.is_super_admin()
    or exists(select 1 from public.patients p
      where p.id = patient_id and p.store_id = public.current_user_store_id())
  );
create policy "self_view_fa" on public.family_accounts
  for select using (user_id = auth.uid());
create policy "staff_manage_fa" on public.family_accounts
  for all using (
    public.is_super_admin()
    or (public.is_staff() and exists(
      select 1 from public.patients p
      where p.id = patient_id and p.store_id = public.current_user_store_id()
    ))
  );

-- =============================================
-- 7. family_invites ポリシー
-- =============================================
-- スタッフ: 自店利用者の招待コード閲覧・発行 / システム管理者: 全店
create policy "staff_view_invites" on public.family_invites
  for select using (
    public.is_super_admin()
    or exists(select 1 from public.patients p
      where p.id = patient_id and p.store_id = public.current_user_store_id())
  );
create policy "staff_manage_invites" on public.family_invites
  for all using (
    public.is_super_admin()
    or (public.is_staff() and exists(
      select 1 from public.patients p
      where p.id = patient_id and p.store_id = public.current_user_store_id()
    ))
  );

-- 認証なしの招待コード検証 (signup 用): anon ロールで code 検索のみ許可
-- ※ Supabase の anon ロールで実行されるため、SECURITY DEFINER 関数で別途実装する
-- 詳細は 04_seed.sql に含める

-- =============================================
-- 8. ticket_records ポリシー
-- =============================================
-- スタッフ: 自店の全レコード / システム管理者: 全店
-- 家族: 自分の患者のレコードのみ (家族非表示の特記は除外)
create policy "staff_view_tickets" on public.ticket_records
  for select using (public.is_super_admin() or store_id = public.current_user_store_id());

create policy "family_view_tickets" on public.ticket_records
  for select using (patient_id = public.current_family_patient_id());

create policy "staff_manage_tickets" on public.ticket_records
  for all using (
    public.is_super_admin()
    or (public.is_staff() and store_id = public.current_user_store_id())
  )
  with check (public.is_super_admin() or store_id = public.current_user_store_id());

-- =============================================
-- 9. monitoring / fitness / daily_logs / contact_books ポリシー
-- =============================================
-- パターン: スタッフは自店全部、家族は自分の患者のみ、システム管理者は全店

-- monitoring
create policy "staff_view_mon" on public.monitoring_records
  for select using (public.is_super_admin() or store_id = public.current_user_store_id());
create policy "family_view_mon" on public.monitoring_records
  for select using (patient_id = public.current_family_patient_id());
create policy "staff_manage_mon" on public.monitoring_records
  for all using (
    public.is_super_admin()
    or (public.is_staff() and store_id = public.current_user_store_id())
  )
  with check (public.is_super_admin() or store_id = public.current_user_store_id());

-- fitness
create policy "staff_view_fit" on public.fitness_records
  for select using (public.is_super_admin() or store_id = public.current_user_store_id());
create policy "family_view_fit" on public.fitness_records
  for select using (patient_id = public.current_family_patient_id());
create policy "staff_manage_fit" on public.fitness_records
  for all using (
    public.is_super_admin()
    or (public.is_staff() and store_id = public.current_user_store_id())
  )
  with check (public.is_super_admin() or store_id = public.current_user_store_id());

-- daily_logs (家族閲覧不可) / システム管理者は全店閲覧可
create policy "staff_view_logs" on public.daily_logs
  for select using (public.is_super_admin() or store_id = public.current_user_store_id());
create policy "staff_manage_logs" on public.daily_logs
  for all using (
    public.is_super_admin()
    or (public.is_staff() and store_id = public.current_user_store_id())
  )
  with check (public.is_super_admin() or store_id = public.current_user_store_id());

-- contact_books
create policy "staff_view_cb" on public.contact_books
  for select using (public.is_super_admin() or store_id = public.current_user_store_id());
create policy "family_view_cb" on public.contact_books
  for select using (patient_id = public.current_family_patient_id());
create policy "staff_manage_cb" on public.contact_books
  for all using (
    public.is_super_admin()
    or (public.is_staff() and store_id = public.current_user_store_id())
  )
  with check (public.is_super_admin() or store_id = public.current_user_store_id());

-- =============================================
-- 10. announcements ポリシー
-- =============================================
-- スタッフ: 自店のお知らせ全て / システム管理者: 全店
-- 家族: 全体お知らせ + 自分の患者の個別お知らせ
create policy "staff_view_ann" on public.announcements
  for select using (public.is_super_admin() or store_id = public.current_user_store_id());

create policy "family_view_ann" on public.announcements
  for select using (
    public.current_family_patient_id() is not null and (
      scope = 'all'
      or (scope = 'specific' and patient_id = public.current_family_patient_id())
    )
    -- 同じ事業所のお知らせのみ
    and exists(
      select 1 from public.patients p
      where p.id = public.current_family_patient_id()
        and p.store_id = announcements.store_id
    )
  );

create policy "staff_manage_ann" on public.announcements
  for all using (
    public.is_super_admin()
    or (public.is_staff() and store_id = public.current_user_store_id())
  )
  with check (public.is_super_admin() or store_id = public.current_user_store_id());

-- =============================================
-- 11. fax_history ポリシー
-- =============================================
-- スタッフのみ閲覧・管理 / システム管理者は全店
create policy "staff_view_fax" on public.fax_history
  for select using (public.is_super_admin() or store_id = public.current_user_store_id());
create policy "staff_manage_fax" on public.fax_history
  for all using (
    public.is_super_admin()
    or (public.is_staff() and store_id = public.current_user_store_id())
  )
  with check (public.is_super_admin() or store_id = public.current_user_store_id());

-- =============================================
-- 12. family_read_status ポリシー
-- =============================================
-- 家族: 自分の既読情報のみ
create policy "self_manage_read" on public.family_read_status
  for all using (
    family_account_id in (
      select id from public.family_accounts where user_id = auth.uid()
    )
  );

-- =============================================
-- 13. audit_logs ポリシー
-- =============================================
-- 店舗管理者は自店のログを閲覧、システム管理者は全店ログを閲覧
create policy "admin_view_audit" on public.audit_logs
  for select using (
    public.is_super_admin()
    or (public.is_admin() and store_id = public.current_user_store_id())
  );
create policy "any_insert_audit" on public.audit_logs
  for insert with check (true);

-- =============================================
-- 完了
-- =============================================
-- 次は 03_storage.sql を実行してください
