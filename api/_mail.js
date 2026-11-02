// つむぎ: メール送信の共通部品(2026-11-02)
//   背景: Brevo の共有送信IPが迷惑メールの名簿(spamcop)に載り、招待メール・確認コードが Google に拒否された(水元店の件と同じ日)。
//   方針: Google Workspace(tsumugi@ones-style.co.jp など自社のアドレス)から SMTP で送るのを優先し、設定が無いときや失敗したときは Brevo で送る。
//   設定(管理局の外部サービス設定 または Vercel の環境変数):
//     GMAIL_USER / gmail_user                 … 送信に使う Google Workspace のアドレス
//     GMAIL_APP_PASSWORD / gmail_app_password … そのアドレスの「アプリパスワード」(2段階認証を有効にして発行する16文字)
//     BREVO_API_KEY / BREVO_SENDER_EMAIL      … 従来の Brevo(控え)
//   使い方: const r = await sendMailAny({ to: ['a@b'], subject, html, text?, senderName?, replyTo? }); r = { ok, via:'gmail'|'brevo'|'', error, messageId }
import { getSecret } from './_secrets.js';

export async function mailConfig() {
  const user = await getSecret('GMAIL_USER', 'gmail_user');
  const pass = await getSecret('GMAIL_APP_PASSWORD', 'gmail_app_password');
  const brevoKey = await getSecret('BREVO_API_KEY', 'brevo_api_key');
  const brevoFrom = (await getSecret('BREVO_SENDER_EMAIL', 'brevo_sender_email')) || 'noreply@ones-style.co.jp';
  return { gmail: (user && pass) ? { user: String(user).trim(), pass: String(pass).replace(/\s+/g, '') } : null, brevo: brevoKey ? { key: brevoKey, from: brevoFrom } : null };
}

const _norm = (to) => [...new Map((Array.isArray(to) ? to : [to]).filter(Boolean).map(x => (typeof x === 'string' ? { email: x } : x)).filter(x => x && /@/.test(String(x.email || ''))).map(x => [String(x.email).trim().toLowerCase(), { email: String(x.email).trim(), ...(x.name ? { name: String(x.name).trim() } : {}) }])).values()];

async function _gmailTransport(g) {
  const nodemailer = (await import('nodemailer')).default;
  return nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: g.user, pass: g.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
}

// 接続テスト(管理局の外部サービス設定の「接続テスト」用)
export async function verifyGmail() {
  const cfg = await mailConfig();
  if (!cfg.gmail) return { error: 'Google Workspace のアドレスとアプリパスワードが未設定です' };
  try { const t = await _gmailTransport(cfg.gmail); await t.verify(); return { ok: true, detail: `${cfg.gmail.user} でログインできました（送信できます）` }; }
  catch (e) { const m = String((e && e.message) || e); return { error: /535|Username and Password not accepted|BadCredentials/i.test(m) ? 'ログインできません。アプリパスワード（16文字・2段階認証が必要）とアドレスを確認してください' : 'つながりませんでした: ' + m.slice(0, 160) }; }
}

export async function sendMailAny({ to, subject, html, text, senderName, replyTo } = {}) {
  const list = _norm(to); if (!list.length) return { ok: false, via: '', error: '宛先がありません' };
  const cfg = await mailConfig(); const name = String(senderName || 'つむぎ').slice(0, 50); const subj = String(subject || '').slice(0, 120);
  let lastErr = '';
  if (cfg.gmail) {
    try {
      const t = await _gmailTransport(cfg.gmail);
      const info = await t.sendMail({ from: { name, address: cfg.gmail.user }, to: list.map(x => x.name ? { name: x.name, address: x.email } : x.email), subject: subj, html, ...(text ? { text } : {}), ...(replyTo && /@/.test(replyTo) ? { replyTo } : {}) });
      return { ok: true, via: 'gmail', error: '', messageId: info && info.messageId || '' };
    } catch (e) { lastErr = 'Google: ' + String((e && e.message) || e).slice(0, 160); }
  }
  if (cfg.brevo) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': cfg.brevo.key },
        body: JSON.stringify({ sender: { email: cfg.brevo.from, name }, to: list, subject: subj, htmlContent: html, ...(text ? { textContent: text } : {}), ...(replyTo && /@/.test(replyTo) ? { replyTo: { email: replyTo } } : {}) }) });
      if (r.ok) { const j = await r.json().catch(() => ({})); return { ok: true, via: 'brevo', error: lastErr, messageId: (j && j.messageId) || '' }; }
      let tx = ''; try { tx = (await r.text()).slice(0, 200); } catch {}
      lastErr = (lastErr ? lastErr + ' / ' : '') + `Brevo が拒否しました（${r.status}${tx ? ' ' + tx : ''}）`;
    } catch (e) { lastErr = (lastErr ? lastErr + ' / ' : '') + 'Brevo に接続できません（' + String((e && e.message) || e).slice(0, 120) + '）'; }
    return { ok: false, via: 'brevo', error: lastErr };
  }
  return { ok: false, via: '', error: lastErr || 'メール送信の設定がありません（管理局の外部サービス設定で Google Workspace か Brevo を設定してください）' };
}
