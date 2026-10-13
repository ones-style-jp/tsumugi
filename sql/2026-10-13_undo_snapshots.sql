-- =========================================================
-- 「元に戻す」の控えをクラウドに置く(2026-10-13)
--   目的: 提供記録・送迎表の「元に戻す」を、どの端末からでも使えるようにする。
--         店舗データ本体(app_state・約2.5MB)には入れず、この別テーブルに置くので本体は重くならない。
--   仕組み: 保存のたびに RPC push_undo_snapshot で1件追加 → 同じ鍵(店舗・種類・skey)は新しい順に keep 件(既定25)だけ残し、
--           14日より古い控えは店舗単位でサーバーが消す。読み出しは select(anon可)。削除は RPC 経由のみ。
--   実行: Supabase の SQL Editor にこのファイルを貼って Run(本部が1回だけ)。
-- =========================================================
create table if not exists public.undo_snapshots (
  id         bigserial   primary key,
  store_id   text        not null,
  kind       text        not null,          -- 'record'(提供記録) / 'transport'(送迎表)
  skey       text        not null,          -- record: 日付 YYYY-MM-DD / transport: 事業所名
  t          bigint      not null,          -- 控えた時刻(ms)
  label      text        not null default '',
  data       jsonb       not null,
  created_at timestamptz not null default now()
);
create index if not exists undo_snapshots_key_idx on public.undo_snapshots (store_id, kind, skey, t desc);
create index if not exists undo_snapshots_store_created_idx on public.undo_snapshots (store_id, created_at);

alter table public.undo_snapshots enable row level security;
drop policy if exists undo_snapshots_select on public.undo_snapshots;
create policy undo_snapshots_select on public.undo_snapshots for select to anon, authenticated using (true);
grant usage on schema public to anon, authenticated;
grant select on public.undo_snapshots to anon, authenticated;

create or replace function public.push_undo_snapshot(p_store_id text, p_kind text, p_skey text, p_t bigint, p_label text, p_data jsonb, p_keep int default 25)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_store_id is null or p_store_id = '' or p_kind is null or p_skey is null then return null; end if;
  insert into public.undo_snapshots (store_id, kind, skey, t, label, data)
    values (p_store_id, p_kind, p_skey, coalesce(p_t, (extract(epoch from now()) * 1000)::bigint), coalesce(p_label, ''), p_data)
    returning id into v_id;
  -- 同じ鍵は新しい順に p_keep 件だけ残す
  delete from public.undo_snapshots where id in (
    select id from public.undo_snapshots where store_id = p_store_id and kind = p_kind and skey = p_skey order by t desc offset greatest(coalesce(p_keep, 25), 1)
  );
  -- 14日より古い控えは店舗単位で消す
  delete from public.undo_snapshots where store_id = p_store_id and created_at < now() - interval '14 days';
  return v_id;
end $$;
grant execute on function public.push_undo_snapshot(text, text, text, bigint, text, jsonb, int) to anon, authenticated;

create or replace function public.delete_undo_snapshot(p_store_id text, p_id bigint)
returns void
language sql security definer set search_path = public as $$
  delete from public.undo_snapshots where id = p_id and store_id = p_store_id;
$$;
grant execute on function public.delete_undo_snapshot(text, bigint) to anon, authenticated;
