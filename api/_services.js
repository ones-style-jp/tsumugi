// つむぎ: 外部サービス(APIキー等)の一覧定義。管理局の「外部サービス設定」画面と
// サーバー側の資格情報解決(_secrets.js)で共有する唯一の定義元。(2026-09-17)
//
// 新しい外部サービスを足すときは、この配列に1件足すだけで管理局の画面に出る。
//   id      : 内部識別子
//   name    : 画面表示名
//   desc    : 何に使うか(現場の言葉で)
//   status  : 'active'(稼働中の機能) | 'planned'(導入予定・設定欄は用意だけ)
//   required: true なら未設定時に「未設定」を赤で強調
//   fields  : [{ env(環境変数名), dbKey(app_secretsのキー), label, type:'password'|'text', placeholder, note }]
//   test    : 接続テストの種類(なければテストボタンを出さない)

export const EXT_SERVICES = [
  {
    id: 'anthropic',
    name: 'Claude（AI）',
    vendor: 'Anthropic',
    desc: 'モニタリングの下書き作成、記録の要約に使います。未設定だと全店でAI機能が使えません。',
    status: 'active',
    required: true,
    test: 'anthropic',
    fields: [
      { env: 'ANTHROPIC_API_KEY', dbKey: 'anthropic_api_key', label: 'APIキー', type: 'password', placeholder: 'sk-ant-api03-...', note: 'console.anthropic.com → API keys で発行' },
    ],
  },
  {
    id: 'gmaps',
    name: 'Google マップ',
    vendor: 'Google Maps Platform',
    desc: '送迎表の自動配車・お迎え時間の計算に使います。未設定でも手動で並べ替え・時間入力はできます。',
    status: 'active',
    required: false,
    test: 'gmaps',
    fields: [
      { env: 'GOOGLE_MAPS_API_KEY', dbKey: 'google_maps_api_key', label: 'APIキー', type: 'password', placeholder: 'AIza...', note: 'Google Cloud → APIとサービス。Directions API と Geocoding API を有効化' },
    ],
  },
  {
    id: 'brevo',
    name: 'Brevo（メール送信）',
    vendor: 'Brevo',
    desc: 'ご家族・職員への招待メール、パスワード通知、お問い合わせの送信に使います。',
    status: 'active',
    required: true,
    test: 'brevo',
    fields: [
      { env: 'BREVO_API_KEY', dbKey: 'brevo_api_key', label: 'APIキー', type: 'password', placeholder: 'xkeysib-...', note: 'Brevo → SMTP & API → API keys' },
      { env: 'BREVO_SENDER_EMAIL', dbKey: 'brevo_sender_email', label: '送信元メールアドレス', type: 'text', placeholder: 'noreply@ones-style.co.jp', note: 'Brevoで認証済みのアドレス' },
    ],
  },
  {
    id: 'interfax',
    name: 'InterFAX（FAX送信）',
    vendor: 'InterFAX',
    desc: 'モニタリング表などをケアマネジャーへFAX送信するのに使います（1枚あたり約24円）。',
    status: 'active',
    required: false,
    test: 'interfax',
    fields: [
      { env: 'INTERFAX_USER', dbKey: 'interfax_user', label: 'ユーザー名', type: 'text', placeholder: 'ユーザー名', note: '' },
      { env: 'INTERFAX_PASS', dbKey: 'interfax_pass', label: 'パスワード', type: 'password', placeholder: '', note: '' },
    ],
  },
  {
    id: 'admin',
    name: '管理局の合言葉',
    vendor: 'つむぎ',
    desc: 'この画面で外部サービスの設定を変更するときの合言葉です。Vercelの環境変数でのみ設定できます（この画面からは変更できません）。',
    status: 'active',
    required: true,
    envOnly: true,
    fields: [
      { env: 'ADMIN_API_SECRET', dbKey: null, label: '合言葉', type: 'password', placeholder: '', note: 'Vercel → Settings → Environment Variables' },
    ],
  },
  {
    id: 'changelog',
    name: '変更管理台帳・復旧手順書の閲覧',
    vendor: 'つむぎ',
    desc: '台帳ページ(/api/changelog)と復旧手順書(/api/runbook)を開くときのID・パスワードです。',
    status: 'active',
    required: false,
    envOnly: true,
    fields: [
      { env: 'CHANGELOG_USER', dbKey: null, label: '台帳のID', type: 'text', placeholder: 'tsumugi', note: '' },
      { env: 'CHANGELOG_PASS', dbKey: null, label: '台帳のパスワード', type: 'password', placeholder: '', note: '未設定だと初期値のままになります' },
    ],
  },
  {
    id: 'supabase',
    name: 'Supabase（データベース）',
    vendor: 'Supabase',
    desc: 'つむぎのデータ保管先です。ここが未設定だとアプリ自体が動きません。Vercelの環境変数でのみ設定します。',
    status: 'active',
    required: true,
    envOnly: true,
    fields: [
      { env: 'VITE_SUPABASE_URL', dbKey: null, label: 'プロジェクトURL', type: 'text', placeholder: 'https://xxxx.supabase.co', note: '' },
      { env: 'SUPABASE_SERVICE_ROLE_KEY', dbKey: null, label: 'サービスロールキー', type: 'password', placeholder: '', note: 'サーバー専用。絶対に外部へ出さないこと' },
    ],
  },
  // ------- ここから導入予定(設定欄だけ先に用意) -------
  {
    id: 'line',
    name: 'LINE通知',
    vendor: 'LINE公式アカウント',
    desc: 'ご家族への当日のお知らせ・連絡帳の更新通知をLINEで送る機能（2027年予定）。',
    status: 'planned',
    required: false,
    fields: [
      { env: 'LINE_CHANNEL_ACCESS_TOKEN', dbKey: 'line_channel_access_token', label: 'チャネルアクセストークン', type: 'password', placeholder: '', note: 'LINE Developers → Messaging API' },
      { env: 'LINE_CHANNEL_SECRET', dbKey: 'line_channel_secret', label: 'チャネルシークレット', type: 'password', placeholder: '', note: '' },
    ],
  },
  {
    id: 'kokuho',
    name: '国保連請求連携',
    vendor: '国保中央会',
    desc: '介護給付費請求データの作成・送信の連携（2027年予定）。',
    status: 'planned',
    required: false,
    fields: [
      { env: 'KOKUHO_USER', dbKey: 'kokuho_user', label: 'ユーザーID', type: 'text', placeholder: '', note: '' },
      { env: 'KOKUHO_PASS', dbKey: 'kokuho_pass', label: 'パスワード', type: 'password', placeholder: '', note: '' },
    ],
  },
  {
    id: 'esign',
    name: '電子同意書・電子契約',
    vendor: '未定',
    desc: '利用契約書・重要事項説明書・同意書をタブレットで完結させる機能（2027年予定）。',
    status: 'planned',
    required: false,
    fields: [
      { env: 'ESIGN_API_KEY', dbKey: 'esign_api_key', label: 'APIキー', type: 'password', placeholder: '', note: 'サービス選定後に設定' },
    ],
  },
];

export const findService = (id) => EXT_SERVICES.find((s) => s.id === id) || null;
export const findField = (dbKey) => {
  for (const s of EXT_SERVICES) {
    const f = (s.fields || []).find((x) => x.dbKey === dbKey);
    if (f) return { service: s, field: f };
  }
  return null;
};
