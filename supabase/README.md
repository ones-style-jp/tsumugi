# Tsumugi Supabase スキーマ

Tsumugi (デイサービス管理) の Supabase 用 SQL ファイル群です。

## ファイル構成

| ファイル | 用途 | 実行順序 |
|---------|------|---------|
| `01_schema.sql` | テーブル作成 (15個) | 1番目 |
| `02_rls.sql` | Row Level Security ポリシー | 2番目 |
| `03_storage.sql` | Storage バケット設定 (写真用) | 3番目 |
| `04_seed.sql` | 初期データ (最初の事業所登録) | 4番目 |

## 実行方法

1. Supabase ダッシュボード → 左サイドバー「SQL Editor」
2. 各ファイルの中身を順番にコピペ → 実行
3. エラーが出たら止まって相談

## 設計方針

- **マルチテナント**: 全テーブルに `store_id` 列。RLS で事業所間の隔離。
- **UUID 主キー**: 推測されにくくセキュア。
- **ソフトデリート**: `deleted_at` 列で論理削除 (データ復元可)。
- **JSONB**: 運動メニュー等の柔軟データは JSONB で保存。
- **Auth 連携**: Supabase Auth の `auth.users` を参照。

## テーブル一覧

### 組織系
- `stores` - 事業所 (フランチャイズ各店)
- `staff` - スタッフ
- `cm_offices` - ケアマネ事業所
- `care_managers` - ケアマネ担当者

### 利用者系
- `patients` - 利用者
- `emergency_contacts` - 緊急連絡先
- `family_accounts` - 家族アカウント
- `family_invites` - 招待コード

### 記録系
- `ticket_records` - サービス提供記録
- `monitoring_records` - モニタリング
- `fitness_records` - 体力測定
- `daily_logs` - 日誌
- `contact_books` - 連絡帳

### コミュニケーション系
- `announcements` - お知らせ (写真も同梱)
- `fax_history` - FAX 送付履歴

## 改訂履歴

- 2026-06-07: 初版作成
