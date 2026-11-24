-- =====================================================================
-- つむぎ app_state の「版(version)を自動で進める」仕掛け(2026-11-24 案・本部が内容を確認して承認後に SQL Editor で実行)
--   なぜ: 試験版 trial624 から、端末は「版(version)が同じなら店舗データ(2.5MB)を取り直さない」(最長 60 分)。
--         本部が SQL で app_state.data を直接直したとき version を +1 し忘れると、端末が最長 60 分気づかない。
--         この仕掛けを入れると、data を書き換えたのに version を変えていない更新は、自動で version が +1 され updated_at も今になる。
--   端末の保存(CAS)は影響なし: 端末は必ず「version = 読んだ版 の行だけを version = 読んだ版+1 で更新」するので、
--         NEW.version <> OLD.version となり、この仕掛けは何もしない(/api/state-cas も同じ条件)。
--   戻すとき: いちばん下の「戻す」を実行。
--   実行の前に: 控え(R-90)を取る。実行は何度流しても同じ結果(create or replace / drop if exists)。
-- =====================================================================

create or replace function public.tsu_app_state_bump_version()
returns trigger
language plpgsql
as $$
begin
  -- data が変わったのに version が同じ(= SQL で直接直した)ときだけ、版を進めて更新時刻も今にする
  if new.data is distinct from old.data and new.version is not distinct from old.version then
    new.version := coalesce(old.version, 0) + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

comment on function public.tsu_app_state_bump_version() is 'つむぎ: app_state.data を SQL で直接直したときに version を自動で +1(端末が 60 分気づかないのを防ぐ)。端末の CAS 更新には影響しない';

drop trigger if exists tsu_app_state_bump_version on public.app_state;
create trigger tsu_app_state_bump_version
  before update on public.app_state
  for each row execute function public.tsu_app_state_bump_version();

-- 確認: 仕掛けが入っていること
select tgname, tgenabled from pg_trigger where tgrelid = 'public.app_state'::regclass and tgname = 'tsu_app_state_bump_version';

-- 動作の確認(テスト店舗の行だけ・data は変えずに version が動かないこと／data を変えると version が +1 になること)
-- select key, version, updated_at from app_state where key = 'store_test';
-- update app_state set data = jsonb_set(data, '{_tsuBumpCheck}', to_jsonb(now()::text)) where key = 'store_test';
-- select key, version, updated_at from app_state where key = 'store_test';   -- version が +1 になっていれば OK
-- update app_state set data = data - '_tsuBumpCheck' where key = 'store_test';   -- 片付け(さらに +1 される。問題なし)

-- ---------------------------------------------------------------------
-- 戻す
-- drop trigger if exists tsu_app_state_bump_version on public.app_state;
-- drop function if exists public.tsu_app_state_bump_version();
