-- =====================================================================
-- つむぎ 見出しの表 state_head(2026-11-22 案・本部が内容を確認して承認後に SQL Editor で実行)
--   目的: 「店舗のデータが変わった」の合図を、2.5MB の app_state の行そのものではなく
--         「店舗・版・更新時刻・最低版」だけの小さな表から出す(端末はこの表だけを見張る)。
--   やること: ① 表を作る ② app_state が変わるたびに自動で書く仕掛け(トリガー) ③ 今の値を写す
--             ④ 読み取りだけ許す(RLS) ⑤ 即時の合図(Realtime)の対象にする
--   戻すとき: いちばん下の「戻す」を実行(表を消しても app_state には影響なし)
--   実行の前に: 控え(R-90)を取る。実行は 1 回だけ(2 回目は "already exists" で止まる→問題なし)
-- =====================================================================

-- ① 表
create table if not exists public.state_head (
  key         text primary key,                  -- app_state.key と同じ(店舗ID・予約キー)
  version     bigint      not null default 0,    -- app_state.version の写し
  updated_at  timestamptz not null default now(),-- app_state.updated_at の写し
  min_build   text        not null default '',   -- この店舗で使ってよい最低版(空=制限なし・将来 P0-3 で使う)
  note        text        not null default ''    -- 本部のメモ(任意)
);
comment on table public.state_head is 'つむぎ: app_state の見出し(版・更新時刻・最低版)。端末はこの表だけを見張る。中身(data)は持たない';

-- ② app_state が書かれたら見出しを書く(insert/update の後)
create or replace function public.tsu_state_head_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.state_head(key, version, updated_at)
  values (new.key, coalesce(new.version, 0), coalesce(new.updated_at, now()))
  on conflict (key) do update
    set version = excluded.version,
        updated_at = excluded.updated_at;
  return new;
end $$;

drop trigger if exists trg_tsu_state_head_sync on public.app_state;
create trigger trg_tsu_state_head_sync
  after insert or update of version, updated_at, data on public.app_state
  for each row execute function public.tsu_state_head_sync();

-- ③ 今の値を写す(diag_ の行は見出し不要なので除く)
insert into public.state_head(key, version, updated_at)
select key, coalesce(version, 0), coalesce(updated_at, now())
from public.app_state
where key not like 'diag\_%' escape '\'
on conflict (key) do update set version = excluded.version, updated_at = excluded.updated_at;

-- ④ 読み取りだけ(書くのはトリガー=サーバー側だけ)
alter table public.state_head enable row level security;
drop policy if exists state_head_read on public.state_head;
create policy state_head_read on public.state_head for select to anon, authenticated using (true);
revoke insert, update, delete on public.state_head from anon, authenticated;
grant select on public.state_head to anon, authenticated;

-- ⑤ 即時の合図の対象にする(すでに入っていれば "already member" で止まる→問題なし)
alter publication supabase_realtime add table public.state_head;

-- 確認(読むだけ): 店舗ごとの版と更新時刻が app_state と同じか
-- select h.key, h.version, a.version as app_version, h.updated_at, a.updated_at as app_updated
--   from public.state_head h join public.app_state a using (key) order by h.key;

-- ---------------------------------------------------------------------
-- 戻す(必要なときだけ・app_state は変わらない)
-- alter publication supabase_realtime drop table public.state_head;
-- drop trigger if exists trg_tsu_state_head_sync on public.app_state;
-- drop function if exists public.tsu_state_head_sync();
-- drop table if exists public.state_head;
