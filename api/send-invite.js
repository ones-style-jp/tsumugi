// Vercel Serverless Function: 家族専用ページ招待メール送信 (Brevo SMTP API)
// 環境変数:
//   BREVO_API_KEY        - Brevo の API キー (Sensitive)
//   BREVO_SENDER_EMAIL   - 送信元メールアドレス (Brevo で認証済みのアドレス)
//
// クライアントから POST /api/send-invite で呼び出し
// body: { to, toName?, inviteUrl, facilityName?, patientName?, facilityPhone?, expiresAtJp? }

export default async function handler(req, res) {
  // CORS (同一オリジン想定だが念のため)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@ones-style.co.jp';

  if (!apiKey) {
    return res.status(500).json({ error: 'BREVO_API_KEY が設定されていません (Vercel の Environment Variables を確認してください)' });
  }

  // body のパース (Vercel は通常自動で JSON 解析するが念のため)
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const { to, toName, inviteUrl, facilityName, patientName, facilityPhone, expiresAtJp } = body;

  if (!to || !inviteUrl) {
    return res.status(400).json({ error: '送信先 (to) と招待URL (inviteUrl) は必須です' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'メールアドレスの形式が正しくありません' });
  }

  const safeFacility = facilityName || 'デイサービス';
  const safePatient = patientName || '';
  const safeExpires = expiresAtJp || '14日後';

  const subject = `【${safeFacility}】${safePatient ? `${safePatient} 様の` : ''}ご家族専用ページへのご招待`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"></head>
<body style="font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP',sans-serif;background:#f4f8ed;margin:0;padding:24px;color:#1e293b;">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:14px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="text-align:center;border-bottom:2px solid #94c456;padding-bottom:16px;margin-bottom:20px;">
      <div style="font-size:13px;color:#5e8030;font-weight:bold;letter-spacing:2px;">${safeFacility}</div>
      <div style="font-size:20px;color:#3d5021;font-weight:bold;margin-top:6px;">ご家族専用ページへのご招待</div>
    </div>
    <p style="font-size:14px;line-height:1.8;margin:12px 0;">
      ${safePatient ? `<strong>${safePatient} 様</strong>のご家族の皆さま<br/>` : ''}
      いつもお世話になっております。<br/>
      ${safeFacility} より、ご家族専用ページのご招待をお送りいたします。
    </p>
    <p style="font-size:13px;line-height:1.8;margin:12px 0;color:#475569;">
      下記のボタンから登録ページを開き、ID・パスワード等を設定してください。
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#7daa3d,#5e8030);color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:bold;font-size:15px;letter-spacing:1px;box-shadow:0 4px 12px rgba(94,128,48,0.3);">
        登録ページを開く
      </a>
    </div>
    <p style="font-size:11px;color:#94a3b8;line-height:1.7;margin:16px 0;text-align:center;">
      ボタンが表示されない場合は下記URLをコピーしてブラウザに貼り付けてください<br/>
      <a href="${inviteUrl}" style="color:#5e8030;word-break:break-all;">${inviteUrl}</a>
    </p>
    <div style="background:#f4f8ed;border-radius:8px;padding:12px 14px;margin:20px 0;font-size:11px;color:#5e8030;line-height:1.8;">
      <strong>ご注意:</strong><br/>
      ・このURLは <strong>${safeExpires}まで</strong> 有効です<br/>
      ・1回のご登録でのみ使用できます<br/>
      ・URLは個人情報を含みますので、第三者にお伝えしないでください
    </div>
    <p style="font-size:11px;color:#94a3b8;line-height:1.6;margin-top:20px;text-align:center;border-top:1px solid #e2e8f0;padding-top:14px;">
      ${safeFacility}${facilityPhone ? ` / TEL ${facilityPhone}` : ''}<br/>
      心当たりがない場合はこのメールを破棄してください
    </p>
  </div>
</body></html>
  `.trim();

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: `${safeFacility} (Tsumugi 紡ぎ)` },
        to: [{ email: to, name: toName || '' }],
        subject,
        htmlContent: htmlBody,
        replyTo: facilityName ? { email: senderEmail, name: safeFacility } : undefined,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(response.status).json({
        error: `Brevo API エラー (${response.status})`,
        detail: errText.slice(0, 500),
      });
    }

    const data = await response.json().catch(() => ({}));
    return res.status(200).json({ success: true, messageId: data?.messageId || null });
  } catch (e) {
    return res.status(500).json({ error: 'メール送信に失敗しました', detail: String(e).slice(0, 500) });
  }
}
