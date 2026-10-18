-- つむぎ データ保護(段階3の準備): 関数(RPC)の定義だけを出す【読むだけ・何も変えない】 (2026-10-18)
-- 使い方: Supabase → SQL Editor → 貼り付けて Run → 表の上「Export」→「Download CSV」→ そのファイルを
--        Google Drive の マイドライブ/Claude/docs/sql/ に入れる(ファイル名はそのままでよい) → Claude に「入れた」と伝える
--   (画面のコピー貼り付けだと長すぎて途中で切れるため、ファイルで渡す)
select p.proname as function_name,
       p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('upsert_ticket_records','delete_ticket_record','push_sync_ops','push_undo_snapshot','delete_undo_snapshot')
order by 1;
