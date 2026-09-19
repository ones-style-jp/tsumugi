// Vercel Serverless Function: 緊急連絡(災害時など)の一斉メール送信 (2026-09-18・運営推進会議の要望)
// 店舗が「件名・本文・送信先(ご家族/担当ケアマネ)」を指定し、Brevo経由で1通ずつ送る(宛先は互いに見えない)。
//
// 資格情報: BREVO_API_KEY / BREVO_SENDER_EMAIL (Vercel環境変数 → 無ければ管理局の外部サービス設定・app_secrets)
//
// POST /api/notify-batch
//   body: { facility, subject, text, recipients:[{ email, name?, label? }], replyTo? }
//   → { ok, total, sent, failed:[{ email, err }], skipped:[{ email, err }] }
//
// ★ 安全装置
//   ・1回の送信は最大 300 件(Brevo無料枠=1日300通。超える場合は分割送信を案内)
//   ・同じメールアドレスは1回だけ送る(家族が複数の利用者に紐づいていても1通)
//   ・件名/本文はHTMLエスケープして埋め込む(本文の改行はそのまま改行として表示)
import { getSecret } from './_secrets.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MAX_PER_CALL = 300;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  const apiKey = await getSecret('BREVO_API_KEY', 'brevo_api_key');
  const senderEmail = (await getSecret('BREVO_SENDER_EMAIL', 'brevo_sender_email')) || 'noreply@ones-style.co.jp';
  if (!apiKey) return res.status(500).json({ error: 'メール送信の設定(BREVO_API_KEY)がありません。つむぎ管理局の「外部サービス設定」をご確認ください。' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const facility = String(body.facility || 'つむぎ').trim().slice(0, 60);
  const subject = String(body.subject || '').trim().slice(0, 100);
  const text = String(body.text || '').trim().slice(0, 4000);
  const replyTo = String(body.replyTo || '').trim();
  const list = Array.isArray(body.recipients) ? body.recipients : [];
  if (!subject || !text) return res.status(400).json({ error: '件名と本文は必須です' });
  if (!list.length) return res.status(400).json({ error: '送信先がありません' });

  // 重複と形式チェック
  const seen = new Set(); const recipients = []; const skipped = [];
  for (const r of list) {
    const email = String((r && r.email) || '').trim().toLowerCase();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped.push({ email, err: 'メールアドレスの形式が正しくありません' }); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email, name: String((r && r.name) || '').trim().slice(0, 60), label: String((r && r.label) || '').trim().slice(0, 60),
      // ★ 宛先ごとの本文(安否の行つき)。無ければ共通本文
      text: String((r && r.text) || '').trim().slice(0, 4000) });
  }
  if (!recipients.length) return res.status(400).json({ error: '有効な送信先がありません', skipped });
  if (recipients.length > MAX_PER_CALL) {
    return res.status(400).json({ error: `一度に送れるのは${MAX_PER_CALL}件までです(今回 ${recipients.length}件)。送信先を分けてください。` });
  }

  const htmlOf = (body) => `<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:15px;line-height:1.8;color:#1d2a22;max-width:640px;">
    <div style="background:#f4f8ed;border-left:5px solid #7daa3d;padding:10px 14px;margin-bottom:16px;font-weight:bold;">${esc(facility)} からの緊急連絡</div>
    <div style="white-space:pre-wrap;">${esc(body)}</div>
    <hr style="border:none;border-top:1px solid #e3e8dd;margin:20px 0;">
    <div style="font-size:12px;color:#7c8a80;">このメールは ${esc(facility)} の記録システム「つむぎ」から送信されています。ご返信は事業所へ直接お電話ください。</div>
  </div>`;

  const sendOne = async (r) => {
    const toEntry = { email: r.email }; if (r.name) toEntry.name = r.name;
    const body = r.text || text; // ★ 宛先ごとの本文(安否の行つき)があればそれを使う
    const payload = {
      sender: { email: senderEmail, name: facility.slice(0, 50) },
      to: [toEntry],
      subject: `【${facility}】${subject}`.slice(0, 100),
      htmlContent: htmlOf(body),
      textContent: `${facility} からの緊急連絡\n\n${body}`,
      ...(replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo) ? { replyTo: { email: replyTo } } : {}),
    };
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      let m = ''; try { m = JSON.parse(t)?.message || ''; } catch {}
      throw new Error(m || `HTTP ${resp.status}`);
    }
  };

  // 5並列で送る(Brevoのレート制限を避けつつ、74件でも十数秒で終わる)
  const failed = []; let sent = 0;
  const queue = recipients.slice();
  const worker = async () => {
    while (queue.length) {
      const r = queue.shift();
      try { await sendOne(r); sent++; }
      catch (e) { failed.push({ email: r.email, name: r.name, err: String((e && e.message) || e).slice(0, 120) }); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, recipients.length) }, worker));

  return res.status(200).json({ ok: failed.length === 0, total: recipients.length, sent, failed, skipped });
}
