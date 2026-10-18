-- つむぎ データ保護 段階3c: 写真・書類のバケット(personal-files)を非公開にする (下書き 2026-10-19・実行はまだ)
--   (2026-10-19 実測: バケット自体はすでに非公開(public=false)だが、公開キー(anon)に SELECT/INSERT のポリシーがあるため
--    「公開キー＋パス」で誰でも取れる・置ける状態。この SQL は anon のポリシーを外し、証(authenticated)だけにする)
--   いまは公開キーで取れる。証だけにすると
--   職員の端末は Supabase の証(authenticated)で署名 URL を作り、ご家族・ケアマネのポータルはサーバー(/api/files)が
--   本人確認をして署名 URL を渡す(アップロードも同様)。
--
-- ★ 実行の条件: 段階3b と同時か、そのあと(全店「証あり」・ポータルは新しい仕組みでログイン済み・安定版に /api/files が入っている=1018d 以降)。
-- ★ 戻し: data_protection_3c_storage_rollback.sql
-- 実行場所: Supabase ダッシュボード → SQL Editor

-- 0) 現状の確認(控えておく)
select id, public from storage.buckets where id = 'personal-files';
select policyname, roles, cmd, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects';

-- 1) 非公開に
update storage.buckets set public = false where id = 'personal-files';

-- 2) このバケットに関わる既存ポリシー(anon 向け等)を外す
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
           and (coalesce(qual, '') like '%personal-files%' or coalesce(with_check, '') like '%personal-files%') loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop; end $$;

-- 3) 証(authenticated)を持つ端末だけ 読む/置く/消す。証の無い端末(anon)は何もできない。サーバー(service_role)は常に可
create policy pf_auth_select on storage.objects for select to authenticated using (bucket_id = 'personal-files');
create policy pf_auth_insert on storage.objects for insert to authenticated with check (bucket_id = 'personal-files');
create policy pf_auth_update on storage.objects for update to authenticated using (bucket_id = 'personal-files') with check (bucket_id = 'personal-files');
create policy pf_auth_delete on storage.objects for delete to authenticated using (bucket_id = 'personal-files');

-- 4) 確認
--   公開キーで取れない(400/403): curl -s -o /dev/null -w "%{http_code}" -H "apikey: <公開キー>" -H "Authorization: Bearer <公開キー>" "https://<プロジェクト>.supabase.co/storage/v1/object/authenticated/personal-files/<既存のパス>"
--   店舗の端末: 個人ファイルの写真・PDF が開く(署名 URL)。ご家族: フェイスシートの添付・連絡帳の写真が開く(/api/files 経由)。
-- ★ 実行したら docs/sql/rls_status.json の "3c_storage_private" を true にして commit。
