-- つむぎ データ保護 段階3a の戻し: 制限をかける前の状態(誰でも読める)に戻す (2026-10-17)
--   使うとき: 3a 実行後に「元に戻すの一覧が出ない」「同期の履歴が読めない」など店舗の不具合が出て、
--             すぐに原因が分からないとき。数分で元に戻る。アプリの差し戻しは不要。
-- 実行場所: Supabase ダッシュボード → SQL Editor → 全体を貼り付けて Run

-- sync_ops / undo_snapshots の RLS を外す(ポリシーも消す)
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='sync_ops' loop
    execute format('drop policy if exists %I on public.sync_ops', r.policyname);
  end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='undo_snapshots' loop
    execute format('drop policy if exists %I on public.undo_snapshots', r.policyname);
  end loop; end $$;
alter table public.sync_ops disable row level security;
alter table public.undo_snapshots disable row level security;

-- 関数(RPC)に足した店舗確認は残しても害はない(本部・自店の証なら通る)。
-- 証の無い端末からも書けるように戻す必要があるときだけ、inventory で控えた「元の定義」を貼り直す。
-- 補助関数(tsumugi_*)はそのまま残してよい(他の表には影響しない)。
