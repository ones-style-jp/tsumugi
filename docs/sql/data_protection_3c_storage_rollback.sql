-- つむぎ データ保護 段階3c の戻し: personal-files を公開バケットに戻す (2026-10-19)
update storage.buckets set public = true where id = 'personal-files';
-- 証の無い端末(anon)からの読み書きを戻すとき(段階3c 前の状態):
create policy pf_anon_select on storage.objects for select to anon using (bucket_id = 'personal-files');
create policy pf_anon_insert on storage.objects for insert to anon with check (bucket_id = 'personal-files');
-- authenticated 向けのポリシー(pf_auth_*)は残しても害はない。
