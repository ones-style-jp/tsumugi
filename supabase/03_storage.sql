-- =============================================
-- Tsumugi Storage 設定 (03_storage.sql)
-- 写真用のバケットを作成
-- =============================================

-- =============================================
-- 1. Storage バケット作成
-- =============================================

-- announcement-photos バケット (お知らせ添付写真)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-photos',
  'announcement-photos',
  false,                                    -- プライベート (認証必須)
  10485760,                                 -- 10MB/枚 上限
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- patient-documents バケット (介護保険証写真など)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-documents',
  'patient-documents',
  false,
  20971520,                                 -- 20MB/枚 上限
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- staff-avatars バケット (スタッフアバター - 任意)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-avatars',
  'staff-avatars',
  false,
  2097152,                                  -- 2MB
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- =============================================
-- 2. Storage RLS ポリシー
-- =============================================
-- パス構成: announcement-photos/{store_id}/{patient_id_or_all}/{file_name}
-- 例: announcement-photos/abc-123/all/20260607_event.jpg
-- 例: announcement-photos/abc-123/def-456/20260607_visit.jpg

-- =============================================
-- 2.1 announcement-photos ポリシー
-- =============================================

-- スタッフ: 自店フォルダ配下を読み書き
create policy "staff_read_announcement_photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'announcement-photos'
    and (storage.foldername(name))[1]::uuid = public.current_user_store_id()
  );

create policy "staff_upload_announcement_photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'announcement-photos'
    and (storage.foldername(name))[1]::uuid = public.current_user_store_id()
    and public.is_staff()
  );

create policy "staff_delete_announcement_photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'announcement-photos'
    and (storage.foldername(name))[1]::uuid = public.current_user_store_id()
    and public.is_staff()
  );

-- 家族: 自分の患者の写真 + 全体お知らせ写真 を読み取り
create policy "family_read_announcement_photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'announcement-photos'
    and exists(
      select 1 from public.patients p
      where p.id = public.current_family_patient_id()
        and (storage.foldername(name))[1]::uuid = p.store_id
        and (
          (storage.foldername(name))[2] = 'all'
          or (storage.foldername(name))[2]::uuid = p.id
        )
    )
  );

-- =============================================
-- 2.2 patient-documents ポリシー
-- =============================================
-- スタッフのみ読み書き (保険証等の機密)

create policy "staff_read_patient_docs" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1]::uuid = public.current_user_store_id()
    and public.is_staff()
  );

create policy "staff_write_patient_docs" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1]::uuid = public.current_user_store_id()
    and public.is_staff()
  );

create policy "staff_delete_patient_docs" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1]::uuid = public.current_user_store_id()
    and public.is_admin()
  );

-- =============================================
-- 2.3 staff-avatars ポリシー
-- =============================================
-- 同じ事業所のスタッフは互いに閲覧可、自分の画像のみ書き換え可

create policy "staff_read_avatars" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-avatars'
    and (storage.foldername(name))[1]::uuid = public.current_user_store_id()
  );

create policy "staff_write_own_avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-avatars'
    and (storage.foldername(name))[1]::uuid = public.current_user_store_id()
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "staff_update_own_avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'staff-avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- =============================================
-- 完了
-- =============================================
-- 次は 04_seed.sql を実行してください
