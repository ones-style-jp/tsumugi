# -*- coding: utf-8 -*-
# 2026-11-26 FCミーティング(11/27)用「つむぎ 進捗のご報告(11月)」A4 PDF / Artifact 用 HTML
#   読む人: FC の皆さま(オーナー・店舗の管理者)・本部。専門用語は少なく、ガントチャートで見せる
#   使い方: python3 -X utf8 fc_report_pdf_1127.py <out.html>
#   PDF: buildenv2 で node topdf_fc.mjs <out.html> <out.pdf>
import sys, html as H
from datetime import date
out = sys.argv[1]
esc = H.escape

CSS = """
:root { --ink:#1e2a23; --sub:#5a675f; --line:#d6ddd8; --soft:#f3f7f4; --green:#2f7d4f; --green-d:#1d5b37; --green-s:#e5f2ea;
  --orange:#d9822b; --orange-d:#9a5310; --orange-s:#fdf1e3; --grey:#a7aea9; --grey-s:#eef1ef; --today:#c8601a; --paper:#ffffff; }
* { box-sizing: border-box; }
html, body { background: var(--paper); color: var(--ink); }
body { font-family: "Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif; font-size: 10pt; line-height: 1.65; margin: 0; padding: 0 16px; max-width: 980px; margin: 0 auto; }
h1 { font-size: 20pt; margin: 6px 0 2px; color: var(--green-d); letter-spacing: .02em; text-wrap: balance; }
.by { color: var(--sub); font-size: 9.5pt; border-bottom: 2px solid var(--green); padding-bottom: 6px; }
h2 { font-size: 13.5pt; margin: 18px 0 6px; color: var(--green-d); border-left: 5px solid var(--green); background: var(--soft); padding: 4px 10px; break-after: avoid; text-wrap: balance; }
h3 { font-size: 11pt; margin: 12px 0 4px; color: var(--green-d); break-after: avoid; }
p { margin: 4px 0; } ul { margin: 3px 0 6px; padding-left: 1.3em; } li { margin: 2px 0; }
.note { font-size: 8.8pt; color: var(--sub); }
.keep { break-inside: avoid; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0; }
.kpi { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; break-inside: avoid; }
.kpi .v { font-size: 21pt; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; color: var(--ink); }
.kpi .v small { font-size: 10.5pt; color: var(--sub); margin-left: 2px; }
.kpi .k { font-size: 9pt; color: var(--sub); }
.kpi.ok .v { color: var(--green); } .kpi.next .v { color: var(--orange-d); }
.sum { border-left: 5px solid var(--green); background: var(--soft); padding: 8px 14px; margin: 10px 0; }
table.t { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9.3pt; }
table.t th, table.t td { border: 1px solid var(--line); padding: 5px 8px; vertical-align: top; text-align: left; }
table.t th { background: var(--grey-s); color: var(--green-d); }
tr { break-inside: avoid; }
.tw { overflow-x: auto; }
.st { display: inline-block; font-size: 8pt; font-weight: 700; padding: 0 7px; border-radius: 999px; white-space: nowrap; border: 1px solid; line-height: 1.5; vertical-align: 1px; }
.s-ok { background: var(--green-s); color: var(--green-d); border-color: #9fcfb1; }
.s-go { background: #fff; color: var(--green); border-color: var(--green); }
.s-new { background: var(--orange-s); color: var(--orange-d); border-color: #efc28f; }
.s-late { background: #fff; color: var(--orange-d); border-color: var(--orange); }
.s-no { background: var(--grey-s); color: var(--sub); border-color: #cdd3cf; }
.chg { color: var(--orange-d); font-weight: 700; }
/* ガント */
.gwrap { overflow-x: auto; }
.gantt { font-size: 7.3pt; min-width: 860px; }
.g-head, .g-row { display: grid; grid-template-columns: 40% 60%; align-items: center; }
.g-head { font-weight: 700; color: var(--sub); border-bottom: 1.5px solid #9aa59e; }
.g-months { position: relative; height: 18px; }
.g-months span { position: absolute; top: 2px; transform: translateX(3px); white-space: nowrap; }
.g-sec { font-weight: 700; color: var(--green-d); background: var(--soft); padding: 1px 6px; margin-top: 3px; line-height: 1.4; }
.g-row { min-height: 15px; border-bottom: 1px solid #eef1ef; }
.g-label { padding: 0 6px 0 4px; line-height: 1.25; }
.g-track { position: relative; height: 15px; }
.g-track i { position: absolute; top: 0; bottom: 0; border-left: 1px dotted #cfd6d1; }
.g-track .bar { position: absolute; top: 3.5px; height: 8px; border-radius: 3px; background: var(--green); }
.g-track .bar.done { background: var(--grey); }
.g-track .bar.new { background: var(--orange); }
.g-track .bar.plan { background: repeating-linear-gradient(45deg, #9ccbb0, #9ccbb0 3px, #eaf5ee 3px, #eaf5ee 6px); border: 1px dashed var(--green); }
.g-track .ms { position: absolute; top: 3px; width: 9px; height: 9px; transform: translateX(-4.5px) rotate(45deg); background: var(--green-d); }
.g-track .ms.done { background: #6f7872; }
.g-track .ms.new { background: var(--orange); }
.g-track .today { position: absolute; top: -2px; bottom: -2px; border-left: 2px solid var(--today); }
.legend { font-size: 8pt; color: var(--sub); display: flex; gap: 14px; flex-wrap: wrap; margin: 4px 0 6px; }
.legend span { display: inline-flex; align-items: center; gap: 4px; }
.legend b { display: inline-block; width: 18px; height: 8px; border-radius: 2px; }
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
.step { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 9pt; break-inside: avoid; }
.step .n { font-size: 8pt; color: var(--sub); font-variant-numeric: tabular-nums; }
.step .h { font-weight: 700; color: var(--green-d); margin-bottom: 2px; }
.step.now { border: 2px solid var(--orange); background: var(--orange-s); }
ul.check { list-style: none; padding-left: 2px; } ul.check li::before { content: "□"; margin-right: 6px; color: var(--green); }
@media (max-width: 640px) { .kpis { grid-template-columns: 1fr 1fr; } .steps { grid-template-columns: 1fr 1fr; } h1 { font-size: 17pt; } }
@media print {
  body { padding: 0; max-width: none; }
  @page land { size: A4 landscape; margin: 11mm 11mm 11mm 11mm; }
  .land { page: land; } .gantt { min-width: 0; font-size: 6.9pt; } .gwrap { overflow: visible; }
  .land h2 { margin: 0 0 4px; padding: 2px 10px; font-size: 12.5pt; } .land .legend { margin: 2px 0 3px; }
  .land .g-row { min-height: 12.6px; } .land .g-track { height: 12.6px; } .land .g-track .bar { top: 2.6px; height: 7.4px; } .land .g-track .ms { top: 2px; width: 8px; height: 8px; transform: translateX(-4px) rotate(45deg); }
  .land .g-sec { margin-top: 1px; line-height: 1.3; } .land .g-label { line-height: 1.15; } .land .st { font-size: 7pt; line-height: 1.35; padding: 0 5px; }
  .pb { break-before: page; }
}
"""

def ul(items, cls=''): return f'<ul class="{cls}">' + ''.join(f'<li>{it}</li>' for it in items) + '</ul>'
def st(t, c): return f'<span class="st {c}">{esc(t)}</span>'

# ---- ガント(2026/10/1〜2027/4/30)
G0, G1 = date(2026, 10, 1), date(2027, 4, 30); SPAN = (G1 - G0).days
def P(x): return round((x - G0).days / SPAN * 100, 2)
def W(a, b): return round(max(0.6, (b - a).days / SPAN * 100), 2)
TODAY = date(2026, 11, 27)
MONTHS = [date(2026, 10, 1), date(2026, 11, 1), date(2026, 12, 1), date(2027, 1, 1), date(2027, 2, 1), date(2027, 3, 1), date(2027, 4, 1)]
GRID = ''.join(f'<i style="left:{P(m)}%"></i>' for m in MONTHS[1:])
def d(m, dd, y=2026): return date(y, m, dd)
C = lambda t: f'<span class="chg">{t}</span> '
G = [
 ('sec', '店舗への展開'),
 ('row', 'V1.0 正式リリース（10/1）', '達成', [('msdone', d(10, 1), None)]),
 ('row', '扇橋・南水元・東小岩・江古田・西馬込・水元・柴又 利用中', '利用中', [('done', d(10, 1), TODAY), ('bar', TODAY, d(4, 30, 2027))]),
 ('row', C('変更') + '立石店 新しい職員の入社（2月）に合わせて使い始める（2月〜3月）', '', [('new', d(2, 1, 2027), d(3, 31, 2027))]),
 ('row', '池上店 個別にご案内（12月〜1月）', '', [('bar', d(12, 1), d(1, 31, 2027))]),
 ('row', '全店 定着のフォロー（12月〜2月）', '', [('bar', d(12, 1), d(2, 28, 2027))]),
 ('sec', 'データ保護・ログイン'),
 ('row', 'ログインしないと読めない仕組み（10/20）', '達成', [('done', d(10, 16), d(10, 20))]),
 ('row', '一人ずつのログイン＋従業員のPIN 全店へ（11/21）', '達成', [('done', d(10, 19), d(11, 21)), ('msdone', d(11, 21), None)]),
 ('row', C('追加') + '写真と店舗データの控えを毎晩 AWS へ（11/16〜）', '達成', [('msdone', d(11, 16), None), ('done', d(11, 16), TODAY)]),
 ('row', C('追加') + '管理者の交代を店舗から申請・本部が承認（11/22）', '達成', [('msdone', d(11, 22), None)]),
 ('row', '仕上げ（データベース側の守り・本部が実行）11/20 → 12月上旬', '遅れ', [('done', d(11, 13), TODAY), ('new', TODAY, d(12, 10))]),
 ('sec', '重さ対策（11/20 のログインしにくい障害を受けて）'),
 ('row', C('追加') + '第1弾 確認の回数を減らす・ログインを速く（11/22）', '達成', [('done', d(11, 20), d(11, 22)), ('msdone', d(11, 22), None)]),
 ('row', C('追加') + 'データの分割（保存を速く・軽く）設計 → 試験版 12月 → 全店 1月', '', [('new', d(12, 11), d(12, 31)), ('bar', d(1, 1, 2027), d(1, 31, 2027))]),
 ('sec', 'バージョン1.1（LIFE・送迎表・通知）'),
 ('row', '扇橋店 新LIFEへ初めての提出（11/10・2名）', '達成', [('done', d(10, 14), d(11, 10)), ('msdone', d(11, 10), None)]),
 ('row', '扇橋店 LIFE 12月の提出（12/10まで）', '', [('bar', d(12, 1), d(12, 10)), ('ms', d(12, 10), None)]),
 ('row', C('変更') + 'LIFE 全店へ（11月中旬 → 1月〜3月・提出の月に合わせて順に）', '', [('new', d(1, 5, 2027), d(3, 31, 2027))]),
 ('row', '送迎表 全店で利用・ご要望への対応（〜11/28）', '達成', [('done', d(10, 5), d(11, 28))]),
 ('row', C('前倒し') + 'お知らせの通知（プッシュ通知）11/21 → 10/27', '達成', [('msdone', d(10, 27), None)]),
 ('row', C('前倒し') + 'V1.1 の中身 全店へ 12/1 → 11/21', '達成', [('msdone', d(11, 21), None)]),
 ('sec', '計画書'),
 ('row', '通所介護計画書・個別機能訓練計画書 利用中（7月〜）', '利用中', [('done', d(10, 1), TODAY), ('bar', TODAY, d(4, 30, 2027))]),
 ('row', C('追加') + '要支援の方の計画書（運動器機能向上・個別サービス計画書）（11/25）', '達成', [('done', d(11, 22), d(11, 25))]),
 ('row', C('追加') + 'LIFE と一緒に通所介護計画書を作る（評価 → 個別機能訓練 → 通所介護）1月 試験版 → 2月 全店', '', [('new', d(1, 5, 2027), d(1, 31, 2027)), ('bar', d(2, 1, 2027), d(2, 15, 2027))]),
 ('row', '計画書を「選ぶだけ」で作れるように（定型文・プルダウン）2月〜3月', '', [('bar', d(2, 1, 2027), d(3, 31, 2027))]),
 ('sec', '請求（前倒しで着手）'),
 ('row', C('前倒し') + '請求の調べと設計（12月中旬〜1月中旬）', '', [('new', d(12, 14), d(1, 15, 2027))]),
 ('row', C('前倒し') + '試作：利用者負担の請求書・介護給付費の計算（1月〜2月）', '', [('new', d(1, 16, 2027), d(2, 15, 2027))]),
 ('row', C('前倒し') + '扇橋店で今のソフトと並べて突き合わせ（2月〜3月）', '', [('new', d(2, 16, 2027), d(3, 31, 2027))]),
 ('row', '本番の請求（4月〜・目安）・報酬改定（2027年4月）に合わせる', '', [('ms', d(4, 1, 2027), None), ('plan', d(4, 1, 2027), d(4, 30, 2027))]),
 ('sec', 'その後'),
 ('row', '担当者会議用のタブレット（Android・全店 LTE/5G 対応機・12月に購入・試す）', '', [('bar', d(12, 1), d(1, 15, 2027))]),
 ('row', C('検討（案）') + '本部の右腕に AI エージェント（問い合わせの一次対応・不具合の整理）', '', [('plan', d(12, 14), d(2, 28, 2027))]),
 ('row', '検討（案）経営者向けの画面（1月〜2月に試作）', '', [('plan', d(1, 5, 2027), d(2, 28, 2027))]),
 ('row', C('変更') + '電子契約・同意書（11月〜1月 → 3月〜・請求のあと）', '', [('new', d(3, 1, 2027), d(4, 30, 2027))]),
]
def gantt():
    o = ['<div class="gwrap"><div class="gantt">']
    o.append('<div class="g-head"><div class="g-label">項目</div><div class="g-months">' + ''.join(f'<span style="left:{P(m)}%">{"2027年" if m.year == 2027 and m.month == 1 else ""}{m.month}月</span>' for m in MONTHS) + '</div></div>')
    for g in G:
        if g[0] == 'sec': o.append(f'<div class="g-sec">{esc(g[1])}</div>'); continue
        _, lab, state, marks = g
        sm = {'達成': ' ' + st('達成', 's-ok'), '利用中': ' ' + st('利用中', 's-go'), '遅れ': ' ' + st('遅れ', 's-late')}.get(state, '')
        tr = GRID
        for k, a, b in marks:
            if k in ('ms', 'msdone', 'msnew'): tr += f'<span class="ms{" done" if k == "msdone" else (" new" if k == "msnew" else "")}" style="left:{P(a)}%"></span>'
            else: tr += f'<span class="bar{"" if k == "bar" else " " + k}" style="left:{P(a)}%;width:{W(a, b)}%"></span>'
        tr += f'<em class="today" style="left:{P(TODAY)}%"></em>'
        o.append(f'<div class="g-row"><div class="g-label">{lab}{sm}</div><div class="g-track">{tr}</div></div>')
    o.append('</div></div>'); return ''.join(o)

CHANGES = [
 ('お知らせの通知（プッシュ通知）', '11/21〜', '<b>10/27 に全店へ（前倒し）</b>', '早く確かめられたため'),
 ('V1.1（LIFE・送迎表・通知・一人ずつのログイン）', '12/1 配信', '<b>11/21 までに全店へ（前倒し）</b>', '出来たものから順に入れたため'),
 ('LIFE を全店へ', '11月中旬', '<b>1月〜3月に、店舗の提出の月に合わせて順に</b>', '扇橋店の 12 月の提出でもう一度確かめる。請求の準備を先にする'),
 ('請求', '2027年1月から調査', '<b>12月中旬から着手（前倒し）</b>', '毎月の請求を、つむぎの記録からそのまま作れるようにするため'),
 ('電子契約・同意書', '11月〜1月に作成・1/13 配信', '<b>3月から（後ろへ）</b>', '重さ対策と請求を先にするため'),
 ('重さ対策', '計画になし', '<b>11/22 第1弾・12月〜1月 データの分割（追加）</b>', '11/20 にログインしにくい障害があったため'),
 ('データベース側の守り（本部が実行）', '11/20', '<b>12月上旬（遅れ）</b>', '1 本ずつ確かめながら進めるため'),
 ('立石店', '11月〜12月にご案内', '<b>2月〜3月に使い始める</b>', '2月に新しい職員が入るのに合わせるため'),
 ('計画書（通所介護計画書）', '計画書の作り直しは時期未定', '<b>1月 LIFE と一緒に作れるように・2〜3月 選ぶだけで作れるように</b>', 'ご要望。評価から計画書までを続けて作り、手間を減らす'),
 ('経営者向けの画面（案）', '12月〜1月', '<b>1月〜2月</b>', '請求の準備を先にするため'),
 ('担当者会議用のタブレット', '計画になし', '<b>12月に購入（追加）</b>', '外出先の担当者会議で使う。Android の 12 インチ前後で、全店 LTE/5G 対応機に統一（店内では Wi-Fi でも使える）。1 台 5〜6 万円。外で使う回線は会社契約の SIM（1 台 月 440〜1,100 円ほど）で、個人のスマホの通信は使わない'),
 ('本部の体制', '計画になし', '<b>AI エージェントを右腕に（検討・案）</b>', '店舗からの問い合わせや不具合のご連絡に、早く答えられるようにするため'),
]
INCIDENTS = [
 ('11/2', '1店舗で、利用者の情報が古い状態で上書きされた', '当日中に控えから戻した。空の状態では保存しない守りを追加'),
 ('11/4', '職員を消したり役職を変えたりすると、過去の日誌・送迎表から名前が消えた', '名簿に「いつから・いつまで」の履歴を持たせた'),
 ('11/9', '1店舗で、登録した直後の利用者が消えた', '原因を直し、本部で元に戻した（11/10）'),
 ('11/16', 'ご家族のページで入れた緊急連絡先が、店舗の保存で消えた', '項目ごとに新しい方を残す形に直した'),
 ('11/20', '全店でログインしにくい・重い時間があった', '確認の回数を 5 分の 1 に・ログインを速く（11/22）。データの分割を 12 月から'),
 ('11/22', '安定版でログインできない時間があった', '同じ日のうちに直した'),
]
STORES = [
 ('扇橋店', st('利用中', 's-go'), 'LIFE 11/10 提出済み・12 月も提出。請求の突き合わせ（2月〜）も扇橋店で'),
 ('南水元店・東小岩店・江古田店・西馬込店・水元店・柴又店', st('利用中', 's-go'), '毎日の記録・連絡帳・日誌・送迎表で利用中。LIFE は 1 月以降、提出の月に合わせて順に'),
 ('立石店', st('準備', 's-new'), '2月に新しい職員が入るのに合わせて、2月〜3月に使い始めます。利用者情報の取り込みと職員の本人登録を本部がお手伝いします'),
 ('池上店', st('これから', 's-no'), '12月〜1月に個別にご案内'),
]
NEXT = [
 ('12月上旬', 'データベース側の守りの仕上げ（本部）・<b>扇橋店 LIFE 12 月の提出（12/10 まで）</b>・担当者会議用タブレットの購入'),
 ('12月中旬〜', '<b>請求の調べと設計</b>・データの分割（試験版）・池上店へのご案内'),
 ('1月', 'データの分割を全店へ・<b>請求の試作</b>（利用者負担の請求書・介護給付費の計算）・<b>LIFE と一緒に通所介護計画書を作れるように</b>（試験版）・LIFE を全店へ順に・経営者向けの画面（案）'),
 ('2月〜3月', '<b>扇橋店で請求を今のソフトと並べて突き合わせ</b>・<b>立石店で使い始める</b>・計画書を「選ぶだけ」で作れるように・全店の定着フォロー・電子契約と同意書（3月〜）'),
 ('4月〜（目安）', '本番の請求（2027年4月の報酬改定に合わせる）'),
]

h = [f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>つむぎ 11月の進捗</title><style>{CSS}</style></head><body>']
h.append('<h1>つむぎ 進捗のご報告（11月）</h1><div class="by">FCミーティング（2026年11月27日） ・ ワンズスタイル本部</div>')
h.append('<div class="kpis">'
         '<div class="kpi"><div class="v">7<small>/ 9店舗</small></div><div class="k">毎日つむぎを使っている店舗</div></div>'
         '<div class="kpi ok"><div class="v">11/10</div><div class="k">新LIFEへ初めての提出（扇橋店・2名）</div></div>'
         '<div class="kpi ok"><div class="v">11/21</div><div class="k">一人ずつのログイン 全店へ</div></div>'
         '<div class="kpi"><div class="v">1,485<small>件</small></div><div class="k">7月からの改善・修正（11月は 209 件・11/26 まで）</div></div>'
         '<div class="kpi next"><div class="v">12/10</div><div class="k">次の LIFE の提出（扇橋店）</div></div>'
         '<div class="kpi next"><div class="v">12月〜</div><div class="k">請求の準備に着手（前倒し）</div></div>'
         '</div>')
h.append('<div class="sum"><b>この1か月のまとめ</b>' + ul([
  '<b>LIFE</b>は 11月10日に扇橋店で新LIFEへ初めて提出できました。つむぎから本番の LIFE に取り込めることを確かめました。次は 12月10日までに 2 回目を提出します。',
  '<b>一人ずつのログイン</b>は 11月21日に全店へ入りました。共有の iPad でも、誰が入力したかが残ります。',
  '<b>V1.1 の中身</b>（LIFE・送迎表・通知）は、予定の 12/1 より早く全店に入りました。',
  '11月は<b>データの不具合が数件</b>あり、すべて元に戻して再発の防止を入れました。写真と店舗データの控えは毎晩 AWS にも取っています。',
  'これからは<b>重さ対策（データの分割）</b>と<b>請求の準備</b>を先に進め、<b>計画書</b>は LIFE と一緒に作れるようにします。LIFE の全店展開は 1 月から順に行います。']) + '</div>')
# ---- ガント
h.append('<div class="land pb"><h2>1. 計画（ガントチャート・11月27日時点）</h2>')
h.append('<div class="legend"><span><b style="background:#a7aea9"></b>済み</span><span><b style="background:#2f7d4f"></b>これから</span><span><b style="background:#d9822b"></b>今回の変更・追加</span>'
         '<span><b style="background:repeating-linear-gradient(45deg,#9ccbb0,#9ccbb0 3px,#eaf5ee 3px,#eaf5ee 6px);border:1px dashed #2f7d4f"></b>検討（案）・目安</span>'
         '<span>◆ 区切りの日（灰色＝済み）</span><span style="color:#c8601a">｜ 今日（11/27）</span></div>')
h.append(gantt()); h.append('</div>')
# ---- 変更点
h.append('<h2 class="pb">2. 前回（10月23日）の計画からの変更点</h2>')
h.append('<div class="tw"><table class="t"><tr><th style="width:24%">項目</th><th style="width:17%">前の予定</th><th style="width:27%">今の予定</th><th>わけ</th></tr>'
         + ''.join(f'<tr><td>{esc(a)}</td><td>{esc(b)}</td><td>{c}</td><td>{esc(dd)}</td></tr>' for a, b, c, dd in CHANGES) + '</table></div>')
h.append('<p class="note">変えていないもの: LIFE の 3 か月ごとの提出・送迎表のご要望への対応・全店の定着フォロー（12月〜2月）。</p>')
# ---- 不具合
h.append('<div class="keep"><h2>3. 11月に起きた不具合と対応（すべて対応済み）</h2>')
h.append('<div class="tw"><table class="t"><tr><th style="width:9%">日</th><th style="width:44%">起きたこと</th><th>対応</th></tr>'
         + ''.join(f'<tr><td>{a}</td><td>{esc(b)}</td><td>{esc(c)}</td></tr>' for a, b, c in INCIDENTS) + '</table></div>')
h.append('<p class="note">データは 20 分ごとの控え（7日分）に加え、11月16日から毎晩 AWS（大阪）にも控えています。おかしいと感じたら、画面と日時を本部へお知らせください。</p></div>')
# ---- 店舗
h.append('<div class="keep"><h2>4. 店舗ごとの状況</h2>')
h.append('<div class="tw"><table class="t"><tr><th style="width:30%">店舗</th><th style="width:11%">状況</th><th>これから</th></tr>'
         + ''.join(f'<tr><td>{esc(a)}</td><td>{b}</td><td>{esc(c)}</td></tr>' for a, b, c in STORES) + '</table></div></div>')
# ---- 次にやること
h.append('<div class="keep"><h2>5. 次にやること</h2>')
h.append('<div class="tw"><table class="t"><tr><th style="width:16%">いつ</th><th>こと</th></tr>'
         + ''.join(f'<tr><td><b>{esc(a)}</b></td><td>{b}</td></tr>' for a, b in NEXT) + '</table></div></div>')
# ---- 請求
h.append('<div class="keep"><h2>6. 請求の準備（前倒し）</h2>')
h.append('<p>毎日つむぎに入れている出席・欠席・振替の記録と、利用者マスタの介護度・負担割合から、<b>毎月の請求をつむぎで作れる</b>ようにします。LIFE の全店展開より先に、少しずつ手をつけます。</p>')
h.append('<div class="steps">'
         '<div class="step now"><div class="n">12月中旬〜1月中旬</div><div class="h">調べと設計</div>単位数・加算・請求の形式を調べ、つむぎに足りない情報を洗い出す</div>'
         '<div class="step"><div class="n">1月〜2月</div><div class="h">試作</div>利用者負担の請求書（ご家族向け）と、介護給付費の計算</div>'
         '<div class="step"><div class="n">2月〜3月</div><div class="h">扇橋店で突き合わせ</div>今のソフトと同じ月を並べて、金額が一致するか確かめる</div>'
         '<div class="step"><div class="n">4月〜（目安）</div><div class="h">本番</div>2027年4月の報酬改定に合わせて単位数を入れ替える。国保連への提出は本部でまとめる形を検討</div>'
         '</div>')
h.append('<h3>店舗の皆さまへのお願い（今からできること）</h3>' + ul([
  '利用者マスタの<b>介護度・認定の期間・負担割合・保険者番号</b>を、最新にしておいてください。',
  'ケアマネから届いた<b>サービス提供票</b>は、個人ファイルの「サービス提供票」フォルダ（11/25 から全店）に入れてください。',
  '提供記録の<b>出席・欠席・振替</b>は、その日のうちに入れてください。請求の元になります。'], 'check') + '</div>')
h.append('<div class="keep"><h2>7. 本部の体制（検討中・案）: AI エージェントを右腕に</h2>')
h.append('<p>店舗が増えても、ご連絡に早くお答えできるよう、本部の右腕として <b>AI エージェント</b>（決められた仕事を自分で進める AI）を使うことを考えています。</p>')
h.append(ul([
  '<b>任せたいこと</b>: 店舗からの問い合わせへの一次回答（マニュアルをもとに）・不具合のご連絡の整理（いつ・どの画面で・何が起きたか）・毎日の検査結果のまとめ・資料の下書き。',
  '<b>任せないこと</b>: 本番のデータを直すこと・配信の判断・お金や契約に関わる決定。これらは今までどおり本部が確かめてから行います。',
  '<b>個人情報</b>: 利用者さんのお名前や記録は AI に渡さない作りにします。',
  '<b>進め方</b>: 12月〜2月に本部の中だけで試し、役に立つと分かってから店舗とのやりとりに広げます。']))
h.append('</div>')
h.append('<p class="note">気になることや、ご要望があれば、本部までお知らせください。</p>')
h.append('</body></html>')
open(out, 'w', encoding='utf-8').write(''.join(h)); print('ok', out)
