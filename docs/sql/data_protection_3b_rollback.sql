-- つむぎ データ保護 段階3b の戻し: 店舗データ本体の制限を外し、かける前の状態に戻す (2026-10-17)
--   使うとき: 3b 実行後に店舗・本部・ポータルで不具合が出て、すぐに原因が分からないとき。数分で元に戻る。
-- 実行場所: Supabase ダッシュボード → SQL Editor → 全体を貼り付けて Run

do $$ declare r record; t text; begin
  foreach t in array array['app_state','ticket_records','stores','system_notices'] loop
    for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', r.policyname, t);
    end loop;
    execute format('alter table public.%I disable row level security', t);
  end loop; end $$;

-- 関数(RPC)に足した店舗確認(tsumugi_assert_store)は、証の無い端末から書く必要が戻る場合だけ元の定義に貼り直す。
