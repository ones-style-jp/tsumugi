-- =====================================================================
-- つむぎ 消えないための守り(サーバー側)(2026-11-22 案・本部がしきい値を承認してから SQL Editor で実行)
--   目的: 端末がうっかり「利用者が急に減った保存」を送ってきても、サーバー(データベース)が断る。
--         端末側の関所(pushEmptyGuard / pushShrinkGuard)の最後の網。
--   しきい値(案): 利用者が 30% 以上 かつ 5 人以上 減る保存は断る。
--   対象: app_state の店舗の行だけ(diag_ と __ で始まる予約キーは対象外)。
--   本当に大勢が退所する日: 本部が「一時的に外す」(下の set_config)か、トリガーを止める。
--   実行の前に: 控え(R-90)を取る。戻すときはいちばん下。
-- =====================================================================

create or replace function public.tsu_app_state_shrink_guard() returns trigger
language plpgsql as $$
declare
  old_n int; new_n int; drop_n int;
begin
  -- 予約キー・診断行は対象外
  if new.key like 'diag\_%' escape '\' or new.key like '\_\_%' escape '\' then return new; end if;
  -- 本部が一時的に外しているとき(同じセッションで select set_config('tsumugi.allow_shrink','1',false); のあとに実行)
  if coalesce(current_setting('tsumugi.allow_shrink', true), '') = '1' then return new; end if;

  old_n := case when jsonb_typeof(old.data->'patients') = 'array' then jsonb_array_length(old.data->'patients') else 0 end;
  new_n := case when jsonb_typeof(new.data->'patients') = 'array' then jsonb_array_length(new.data->'patients') else 0 end;
  drop_n := old_n - new_n;

  -- 利用者が 30% 以上 かつ 5 人以上 減る → 断る(端末には "shrink-guard" の文字で返る)
  if old_n >= 5 and drop_n >= 5 and new_n < old_n * 0.7 then
    raise exception 'shrink-guard: patients % -> % (key %)', old_n, new_n, new.key
      using errcode = 'P0001', hint = '利用者が急に減る保存です。本当に正しければ本部に連絡してください(一時的に守りを外して保存します)';
  end if;
  return new;
end $$;

drop trigger if exists trg_tsu_app_state_shrink_guard on public.app_state;
create trigger trg_tsu_app_state_shrink_guard
  before update of data on public.app_state
  for each row execute function public.tsu_app_state_shrink_guard();

-- 確認(読むだけ): 店舗ごとの今の利用者数
-- select key, jsonb_array_length(data->'patients') as patients, version, updated_at
--   from public.app_state where key not like 'diag\_%' escape '\' and key not like '\_\_%' escape '\' order by key;

-- 本当に大勢が退所した日(本部だけ・同じ SQL Editor のセッションで続けて実行)
-- select set_config('tsumugi.allow_shrink', '1', false);
-- ...そのあと端末から保存してもらう のではなく、本部が SQL で書くときだけ有効(端末の保存は別セッション)。
-- 端末からの保存を通したいときは、いったんトリガーを止める:
-- alter table public.app_state disable trigger trg_tsu_app_state_shrink_guard;
-- （終わったら） alter table public.app_state enable trigger trg_tsu_app_state_shrink_guard;

-- ---------------------------------------------------------------------
-- 戻す
-- drop trigger if exists trg_tsu_app_state_shrink_guard on public.app_state;
-- drop function if exists public.tsu_app_state_shrink_guard();
