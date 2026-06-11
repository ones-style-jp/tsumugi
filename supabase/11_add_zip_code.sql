-- =============================================
-- stores テーブルに zip_code 列を追加
-- =============================================
-- 店舗追加フォームで郵便番号を入れられるようにするための列追加

alter table public.stores add column if not exists zip_code text;

-- 確認
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'stores'
order by ordinal_position;
