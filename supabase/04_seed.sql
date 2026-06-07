-- =============================================
-- Tsumugi 初期データ + ヘルパー関数 (04_seed.sql)
-- 最初の事業所と管理者の登録 + 招待コード検証関数
-- =============================================

-- =============================================
-- 1. 最初の事業所 (ひかりデイサービス扇橋店) を登録
-- =============================================
insert into public.stores (
  id, name, short_name, zip_code, address, phone, fax, email,
  manager_name, service_time_am, service_time_pm, capacity,
  closed_days, franchise_code, status
) values (
  gen_random_uuid(),
  'ひかりデイサービス扇橋店',
  '扇橋店',
  '135-0011',
  '東京都江東区扇橋1-1-1',
  '03-6458-7415',
  '03-6458-7416',
  'honbu@ones-style.co.jp',
  '佐藤 健一',
  '9:00〜12:05',
  '13:20〜16:25',
  10,
  array[0],                                  -- 日曜定休
  'ONES-DEMO-2026',
  'active'
)
on conflict do nothing;

-- 確認: 作成された事業所IDを取得 (このIDを後で使う)
select id, name from public.stores where name = 'ひかりデイサービス扇橋店';

-- =============================================
-- 2. 招待コード検証用 RPC 関数
-- =============================================
-- 家族が招待コードで signup する際、未認証(anon)状態でコードを検証する関数
-- anon ロールにも実行を許可する

create or replace function public.verify_invite_code(p_code text)
returns table (
  invite_id uuid,
  patient_id uuid,
  patient_name text,
  store_id uuid,
  store_name text,
  valid boolean,
  error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.family_invites%rowtype;
  v_patient public.patients%rowtype;
  v_store public.stores%rowtype;
begin
  -- 招待コードを検索
  select * into v_invite from public.family_invites where code = p_code limit 1;

  if not found then
    return query select null::uuid, null::uuid, null::text, null::uuid, null::text, false, '招待コードが見つかりません';
    return;
  end if;

  if v_invite.used_by is not null then
    return query select v_invite.id, v_invite.patient_id, null::text, null::uuid, null::text, false, 'この招待コードは既に使用されています';
    return;
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return query select v_invite.id, v_invite.patient_id, null::text, null::uuid, null::text, false, 'この招待コードは期限切れです';
    return;
  end if;

  -- 利用者情報を取得
  select * into v_patient from public.patients where id = v_invite.patient_id;
  select * into v_store from public.stores where id = v_patient.store_id;

  return query select
    v_invite.id,
    v_patient.id,
    v_patient.name,
    v_store.id,
    v_store.name,
    true,
    null::text;
end;
$$;

-- anon (未認証ユーザー) からも呼び出せるよう許可
grant execute on function public.verify_invite_code to anon;
grant execute on function public.verify_invite_code to authenticated;

-- =============================================
-- 3. 家族 signup 用 RPC 関数
-- =============================================
-- 招待コードでアカウント作成。Supabase Auth で auth.users にレコードを作成した後に呼ぶ

create or replace function public.consume_invite_and_create_family_account(
  p_code text,
  p_user_id uuid,                    -- auth.users.id (signUp 後に取得)
  p_username text,
  p_relation text,
  p_display_name text,
  p_email text,
  p_ec_name text,
  p_ec_phone text,
  p_ec_phone_mobile text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.family_invites%rowtype;
  v_account_id uuid;
  v_existing_username int;
begin
  -- ID重複チェック
  select count(*) into v_existing_username from public.family_accounts where lower(username) = lower(p_username);
  if v_existing_username > 0 then
    return json_build_object('success', false, 'error', 'このIDは既に使用されています');
  end if;

  -- 招待コード検証
  select * into v_invite from public.family_invites
  where code = p_code and used_by is null and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return json_build_object('success', false, 'error', '招待コードが無効です');
  end if;

  -- アカウント作成
  insert into public.family_accounts (
    id, patient_id, user_id, username, kind, relation, display_name, email
  ) values (
    gen_random_uuid(), v_invite.patient_id, p_user_id, p_username,
    case when p_relation = 'ケアマネージャー' then 'caremanager' else 'family' end,
    p_relation, p_display_name, p_email
  ) returning id into v_account_id;

  -- 招待コードを使用済みに
  update public.family_invites
  set used_by = v_account_id, used_at = now()
  where id = v_invite.id;

  -- 緊急連絡先を追加 (同名+続柄が無い場合のみ)
  if not exists(
    select 1 from public.emergency_contacts
    where patient_id = v_invite.patient_id
      and trim(name) = trim(p_ec_name)
      and trim(relation) = trim(p_relation)
  ) then
    insert into public.emergency_contacts (
      patient_id, name, relation, phone, phone_mobile, email,
      added_by_family_account_id, added_at
    ) values (
      v_invite.patient_id, p_ec_name, p_relation, p_ec_phone, p_ec_phone_mobile, p_email,
      v_account_id, now()
    );
  end if;

  return json_build_object(
    'success', true,
    'account_id', v_account_id,
    'patient_id', v_invite.patient_id
  );
end;
$$;

grant execute on function public.consume_invite_and_create_family_account to authenticated;

-- =============================================
-- 4. 招待コード自動生成 (スタッフ用)
-- =============================================
create or replace function public.generate_family_invite(p_patient_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKMNPQRSTWXYZ23456789';
  v_code text;
  v_part1 text;
  v_part2 text;
  v_attempts int := 0;
  v_patient public.patients%rowtype;
begin
  -- 権限チェック: 利用者の所属事業所にスタッフとして所属しているか
  select * into v_patient from public.patients where id = p_patient_id;
  if not found then
    raise exception '利用者が見つかりません';
  end if;

  if v_patient.store_id <> public.current_user_store_id() then
    raise exception 'この利用者の招待コードを発行する権限がありません';
  end if;

  -- ユニークコード生成 (最大10回試行)
  loop
    v_attempts := v_attempts + 1;
    v_part1 := '';
    v_part2 := '';
    for i in 1..4 loop
      v_part1 := v_part1 || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
      v_part2 := v_part2 || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    end loop;
    v_code := 'FAM-' || v_part1 || '-' || v_part2;

    if not exists(select 1 from public.family_invites where code = v_code) then
      exit;
    end if;
    if v_attempts > 10 then
      raise exception 'コード生成に失敗しました';
    end if;
  end loop;

  insert into public.family_invites (patient_id, code, created_by)
  values (p_patient_id, v_code, (select id from public.staff where user_id = auth.uid()));

  return v_code;
end;
$$;

grant execute on function public.generate_family_invite to authenticated;

-- =============================================
-- 完了
-- =============================================
-- 次のステップ:
-- 1. Supabase ダッシュボード → Authentication → Users から最初のスタッフユーザーを作成
--    (Email: honbu@ones-style.co.jp / 任意のパスワード)
-- 2. 以下のSQLを実行して、そのユーザーを管理者として staff テーブルに登録:
--
-- insert into public.staff (store_id, user_id, last_name, first_name, role, email, is_active)
-- select
--   (select id from public.stores where name = 'ひかりデイサービス扇橋店'),
--   (select id from auth.users where email = 'honbu@ones-style.co.jp'),
--   '佐藤', '健一', 'manager', 'honbu@ones-style.co.jp', true;
--
-- 3. ログインして動作確認
