# -*- coding: utf-8 -*-
# 2026-10-21 「つむぎ職員アンケート 集計と対応」(Claude Docs rev 55)を、同じ内容・同じ形のグラフで A4 の PDF 用 HTML にする
#   python3 make_survey_html.py <out.html>   → playwright で PDF(余白つき)
import sys, math, html as H
out = sys.argv[1]
esc = H.escape

# ---- 数(回答シートを数え直した値・ドキュメントのグラフと同じ)
Q1 = [('西馬込店', 4), ('扇橋店', 4), ('南水元店', 2), ('柴又店', 2), ('江古田店', 1), ('東小岩店', 1), ('立石店', 1)]
Q1C = ['#2b77d6', '#ec6a34', '#1db07d', '#12355f', '#d4557f', '#0d8a12', '#4b3aa6']
QS = [
  ('Q2 つむぎを使う頻度', '毎日', [('毎日', 12, 1.0, 1), ('週に2〜4回', 1, 0.6, 0), ('週1回程度', 1, 0.35, 0), ('使っていない', 1, 0, 0)]),
  ('Q3 全体の満足度', '満足以上', [('とても満足', 4, 1.0, 1), ('満足', 8, 0.6, 1), ('普通', 2, 0.3, 0), ('不満・とても不満', 0, 0.15, 0), ('使っていない', 1, 0, 0)]),
  ('Q4 紙のころと比べて', '楽になった', [('とても楽になった', 5, 1.0, 1), ('楽になった', 8, 0.6, 1), ('変わらない・大変になった', 0, 0.3, 0), ('使っていない', 2, 0, 0)]),
]
Q5 = [('サービス提供記録 入力', 14), ('連絡帳', 12), ('日誌', 12), ('送迎表', 8), ('体力測定', 8), ('利用者マスタ管理', 8), ('カレンダー', 7), ('各種連絡', 6), ('休み連絡', 5), ('分析 稼働', 5), ('分析 個人', 4), ('ケアマネ事業所・担当者', 4), ('モニタリング', 3), ('個人ファイル（担会記録）', 2), ('クラス在籍表', 1)]
Q5USERS = 14
BLUE = '#2b77d6'; GREY = '#c4c5bb'; INK = '#1f2a37'; SUB = '#5b6573'

def pt(cx, cy, r, a): return f'{cx + r * math.sin(a):.2f} {cy - r * math.cos(a):.2f}'
def slice_path(cx, cy, R, r0, a0, a1):
    lg = 1 if a1 - a0 > math.pi else 0
    return f'M {pt(cx, cy, R, a0)} A {R} {R} 0 {lg} 1 {pt(cx, cy, R, a1)} L {pt(cx, cy, r0, a1)} A {r0} {r0} 0 {lg} 0 {pt(cx, cy, r0, a0)} Z'
def donut(cx, cy, R, r0, segs, gap=0.014):
    tot = sum(v for v, _, _ in segs); acc = 0; o = []
    for v, col, op in segs:
        if v <= 0: continue
        a0 = acc / tot * 2 * math.pi; acc += v; a1 = acc / tot * 2 * math.pi
        o.append(f'<path d="{slice_path(cx, cy, R, r0, a0 + gap, a1 - gap)}" fill="{col}" fill-opacity="{op}"/>')
    return ''.join(o)

def chart_q1():
    tot = sum(n for _, n in Q1); cx, cy, R, r0 = 150, 140, 104, 62
    o = [f'<svg viewBox="0 0 680 290" class="chart" role="img" aria-label="7店舗から15件の回答">']
    o.append(f'<text x="0" y="22" class="ct">7店舗から15件の回答をいただきました</text><text x="0" y="42" class="cs">Q1 所属店舗（回答の数）</text>')
    o.append(f'<g transform="translate(0,20)">{donut(cx, cy, R, r0, [(n, Q1C[i], 1) for i, (_, n) in enumerate(Q1)])}'
             f'<text x="{cx}" y="{cy + 8}" text-anchor="middle" class="cbig">{tot}件</text><text x="{cx}" y="{cy + 30}" text-anchor="middle" class="csm">回答</text>')
    for i, (nm, n) in enumerate(Q1):
        y = 58 + i * 30
        o.append(f'<rect x="330" y="{y - 12}" width="15" height="15" rx="3" fill="{Q1C[i]}"/><text x="355" y="{y + 1}" class="lg">{esc(nm)}</text>'
                 f'<text x="480" y="{y + 1}" class="lgb">{n}件</text><text x="530" y="{y + 1}" class="lgs">{round(n / tot * 100)}%</text>')
    o.append('</g></svg>'); return ''.join(o)

def chart_q24():
    o = ['<svg viewBox="0 0 680 360" class="chart" role="img" aria-label="12人が毎日使い、13人が楽になったと答えています">']
    o.append('<text x="0" y="22" class="ct">12人が毎日使い、13人が「紙のころより楽になった」と答えています</text>'
             '<text x="0" y="42" class="cs">15人の回答。色が濃いほど良い答え、灰色は「使っていない」方。真ん中は良い答えの割合</text>')
    colw = 226
    for k, (qn, goodlbl, rows) in enumerate(QS):
        cx = 113 + k * colw; cy = 150; tot = sum(r[1] for r in rows); good = sum(r[1] for r in rows if r[3])
        segs = [(n, BLUE if t > 0 else GREY, t if t > 0 else 1) for _, n, t, _ in rows]
        o.append(f'<text x="{cx}" y="76" text-anchor="middle" class="qn">{esc(qn)}</text>{donut(cx, cy, 58, 35, segs)}'
                 f'<text x="{cx}" y="{cy + 6}" text-anchor="middle" class="cmid">{round(good / tot * 100)}%</text><text x="{cx}" y="{cy + 22}" text-anchor="middle" class="csm">{esc(goodlbl)}</text>')
        for j, (lb, n, t, _) in enumerate(rows):
            y = 238 + j * 22; col = BLUE if t > 0 else GREY; op = t if t > 0 else 1; cls = 'lg2' if n > 0 else 'lg2 dim'
            o.append(f'<rect x="{cx - 100}" y="{y - 11}" width="12" height="12" rx="2" fill="{col}" fill-opacity="{op}"/><text x="{cx - 83}" y="{y}" class="{cls}">{esc(lb)}</text>'
                     f'<text x="{cx + 104}" y="{y}" text-anchor="end" class="{cls} b">{n}人</text>')
    o.append('</svg>'); return ''.join(o)

def chart_q5():
    left, y0, rh, bm = 190, 66, 23, 390; Hh = y0 + len(Q5) * rh + 10
    o = [f'<svg viewBox="0 0 680 {Hh}" class="chart" role="img" aria-label="毎日の記録はほぼ全員が使っています">']
    o.append('<text x="0" y="22" class="ct">毎日の記録（提供記録・連絡帳・日誌）は、ほぼ全員が使っています</text>'
             f'<text x="0" y="42" class="cs">Q5 使っている機能（つむぎを使っている{Q5USERS}人・いくつでも選べる質問）</text>')
    for i, (nm, n) in enumerate(Q5):
        y = y0 + i * rh; w = n / Q5USERS * bm; col = BLUE if n >= 12 else GREY
        o.append(f'<text x="{left - 8}" y="{y + 12}" text-anchor="end" class="lg2">{esc(nm)}</text><rect x="{left}" y="{y}" width="{w:.1f}" height="15" rx="2" fill="{col}"/>'
                 f'<text x="{left + w + 6:.1f}" y="{y + 12}" class="lg2">{n}人（{round(n / Q5USERS * 100)}%）</text>')
    o.append('</svg>'); return ''.join(o)

def ul(items): return '<ul>' + ''.join(f'<li>{it}</li>' for it in items) + '</ul>'
def b(t): return f'<b>{esc(t)}</b>'
def pill(t):
    c = {'試験版で確認中': 'p-trial', '今ある機能で代用': 'p-now', '今後の予定': 'p-later'}[t]; return f'<span class="pill {c}">{esc(t)}</span>'

REQ = [
 ('提供記録で、選んだ方の行の色が変わる（複数選べる）', '試験版で確認中', '名前や運動の欄を押すと、その行が黄色の枠。名前を長押しすると薄い黄色の印（何人でも）。p.75'),
 ('特記に、お休みの理由のような選択肢', '試験版で確認中', '特記の左の「一言」から選ぶ。マイクで話して入れることもできる。言葉は各種設定で変えられる。p.75・p.90'),
 ('運動の○を一括で入れたい', '試験版で確認中', '「一括○」で運動を選び、行わなかった方だけ×にする。p.76'),
 ('体力測定に、数値以外の特記欄（杖・カート使用など）', '試験版で確認中', '項目ごとの「＋備考」。定型文（杖使用・介助ありなど）と「前回と同じ備考を入れる」。p.79'),
 ('送迎表に送りの時間', '試験版で確認中', '送りで家に着く時間を入力・自動計算。週の運行表に「送りの表」、1日の運行表（A4横）に迎えと送りを並べて印刷できる。p.80〜83'),
 ('送迎時間を変えたときのお知らせを印刷', '試験版で確認中', '店舗ごとの書式になるため、連絡帳の連絡事項に次回の送りの時間を入れる形に決めました（「送り時間反映」）。p.89'),
 ('名前の横に、自転車（高い・低い）・マッサージの姿勢・温浴・電気の印', '今ある機能で代用', '各種設定 → サービス提供内容の「項目管理」に項目（例「自転車の高さ：ふつう・高い・低い」）を作り「ポップアップ」にチェック。利用者マスタで方ごとに選ぶと、提供記録で名前を押したときに出る。p.44・p.68'),
 ('個別運動メニューを処方したい（痛みなどから効果的なストレッチを探す）', '今後の予定', '専門の知識が要り、間違った内容を伝えられないため慎重に検討します。作るなら、写真ではなくAIで作った動画で動きを見せる形を考えています。今は、利用者マスタで個別運動①②③の種目と規定値を決められます。p.17・p.44'),
 ('利用者の顔写真を名前の横に', '今後の予定', '10月22日の管理者ミーティングで検討します。'),
]
TRB = [
 ('iPadを長く使うと、時々固まる', 'Wi-Fiの環境や端末の性能（CPUなど）によることが多いと考えています。つむぎ側でも、データを軽くして動きを軽くする予定です。固まったら画面を再読み込みしてください（入力は端末に控えてあり消えません）。', 'p.73・p.96（安定版はp.77）'),
 ('スマホの提供記録で、縦のスクロールが多い', '縦の方が入力しやすい方もいます。利用者を検索して開くか、スマホを横向きにしてiPadと同じ表で入力する方法もあります。', 'p.6・p.16・p.78'),
 ('機能が多くて覚えるのに時間がかかる', '皆さんからのご要望に合わせて機能が増えています。使いやすくはしていきますが、パソコンやExcelと同じように慣れも必要です。少しずつ使ってみてください。', 'このマニュアル全体'),
 ('保存できたか不安', '保存を押すと「保存しました」と出ます。入力は自動でも保存されています（通信が切れても端末に控え、つながると送ります）。', 'p.73'),
 ('殴り書きのようなメモを書くところがない', 'つむぎは記録をまとめる場所なので、走り書きのメモ帳はありません。利用者のことで残したいことは、個人ファイルの「支援経過表」に書いてください。', 'p.51'),
 ('ログインの手順', '試験版の「ログインとロック」で、共有のiPadは「どなたですか」で名前を選び、PIN（数字4桁）だけで入れます。', 'p.5・p.9・p.90'),
 ('説明の文字が多く、字が細かい', '試験版で、毎日使う画面を中心に約250か所の説明文を短くしました（10月21日）。細かい使い方はマニュアルで。', 'p.93'),
 ('（不具合）送迎の順番がいつもと逆になった', '送りは「迎えの逆の順番」が基本です（座席表で変えられます）。迎えの順番が逆になっていた場合は、日付と画面を教えてください。調べます。', 'p.26・p.80'),
]
HQ = [
 ('個人の携帯の使い方', '個人情報と仕事・私用の区別がつきにくい。会社の端末だけで使うか、個人の携帯も使うならその決まりを決める。つむぎ側では、試験版の「ログインとロック」（PINを必須・一定の時間で記録者の選択に戻る・完全にログアウトするまでの時間）が使える。p.90'),
 ('携帯を見ながらの対応', '利用者さんの対応中に画面を見てしまう。入力するタイミング（対応のあとにまとめてなど）を店舗の決まりにする。'),
 ('まだ使い始めていない方へのお手伝い', '利用者情報はCSVでまとめて取り込める（p.42）。エリア担当者が、最初の入力と使い始めを手伝う。'),
 ('店舗の設備', '「店舗設備の問題で不便」の中身（端末の数・Wi-Fiなど）を聞き取る。'),
 ('顔写真', '10月22日の管理者ミーティングで、入れるか・ご家族の同意の取り方を決める。'),
 ('個別運動メニュー', '痛みからストレッチを案内するなら、内容を確かめる人（機能訓練指導員など）を決める。'),
]

css = f"""
@page {{ size: A4; margin: 14mm 14mm 16mm 14mm; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: "Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif; color: {INK}; font-size: 10.5pt; line-height: 1.7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
h1 {{ font-size: 19pt; margin: 0 0 4px; line-height: 1.35; color: #18324f; }}
.by {{ font-size: 9.5pt; color: {SUB}; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2.5px solid #2b77d6; }}
.lead {{ font-size: 11pt; margin: 10px 0 6px; }}
h2 {{ font-size: 14pt; margin: 22px 0 8px; padding: 4px 0 4px 10px; border-left: 5px solid #2b77d6; background: #eef4fc; break-after: avoid; }}
h3 {{ font-size: 11.5pt; margin: 16px 0 6px; color: #18324f; break-after: avoid; }}
p {{ margin: 6px 0; }}
.fig {{ break-inside: avoid; margin: 6px 0 4px; }}
.cap {{ font-size: 8pt; color: {SUB}; margin-top: -2px; }}
svg.chart {{ width: 100%; height: auto; display: block; }}
svg .ct {{ font-size: 15px; font-weight: 700; fill: {INK}; }} svg .cs {{ font-size: 11.5px; fill: {SUB}; }}
svg .cbig {{ font-size: 30px; font-weight: 700; fill: {INK}; }} svg .cmid {{ font-size: 21px; font-weight: 700; fill: {INK}; }} svg .csm {{ font-size: 11px; fill: {SUB}; }}
svg .qn {{ font-size: 13px; font-weight: 700; fill: {INK}; }} svg .lg {{ font-size: 14px; fill: {INK}; }} svg .lgb {{ font-size: 14px; font-weight: 700; fill: {INK}; }} svg .lgs {{ font-size: 13px; fill: {SUB}; }}
svg .lg2 {{ font-size: 12px; fill: {INK}; }} svg .lg2.b {{ font-weight: 700; }} svg .dim {{ fill: #8a93a0; }}
ul {{ margin: 4px 0 8px; padding-left: 20px; }} li {{ margin: 3px 0; }}
ul.check {{ list-style: none; padding-left: 4px; }} ul.check li::before {{ content: "□"; margin-right: 6px; color: #2b77d6; }}
table {{ width: 100%; border-collapse: collapse; font-size: 9pt; margin: 6px 0 8px; }}
th, td {{ border: 1px solid #cfd6de; padding: 5px 7px; vertical-align: top; text-align: left; }}
th {{ background: #eef4fc; color: #18324f; white-space: nowrap; }}
tr {{ break-inside: avoid; }}
.pill {{ display: inline-block; white-space: nowrap; font-size: 8.5pt; font-weight: 700; border-radius: 999px; padding: 0 8px; border: 1px solid; }}
.p-trial {{ color: #1f5fae; background: #e8f1fc; border-color: #9cc0ec; }} .p-now {{ color: #146c43; background: #e6f5ec; border-color: #94d1ad; }} .p-later {{ color: #5b6573; background: #f0f2f4; border-color: #c4cad1; }}
.note {{ font-size: 8.5pt; color: {SUB}; }}
.sec2 {{ break-before: page; }}
"""
body = []
body.append('<h1>つむぎ職員アンケート 集計と対応</h1><div class="by">2026年10月21日 ・ ワンズスタイル本部</div>')
body.append('<p class="lead">アンケートにご協力いただき、ありがとうございました。15人の方から回答をいただきました。まず集計の結果をそのままお知らせし、そのあとに、いただいた声をもとにした対応をまとめています。</p>')
body.append('<h2>アンケートの集計結果</h2><p>回答の期間は10月16日〜20日です。どなたの回答か分からないよう、お名前や店舗は書かずにまとめています（店舗はQ1の数だけ載せています）。</p>')
body.append(f'<h3>回答いただいた店舗（Q1）</h3><div class="fig">{chart_q1()}<div class="cap">つむぎご利用アンケート（職員向け）の回答 Q1・15件・2026年10月16日〜20日</div></div><p>西馬込店と扇橋店から4件ずつ、ほかの5店舗から1〜2件ずついただきました。</p>')
body.append(f'<h3>使う頻度・満足度・紙のころとの比べ（Q2〜Q4）</h3><div class="fig">{chart_q24()}<div class="cap">つむぎご利用アンケート（職員向け）の回答 Q2〜Q4・15件・2026年10月16日〜20日</div></div><p>「不満」「大変になった」と答えた方はいませんでした。使っていない1人の理由は、「利用者情報の入力が足りない・使い方をまだ覚えていないため、慣れたやり方を続けている」でした。</p>')
body.append(f'<h3>使っている機能（Q5）</h3><div class="fig">{chart_q5()}<div class="cap">つむぎご利用アンケート（職員向け）の回答 Q5・使っている14人・2026年10月16日〜20日</div></div><p>モニタリング・個人ファイル・クラス在籍表は、使っている方がまだ少ない機能です。使い方はマニュアルで案内していますので、よろしければ使ってみてください。</p>')
body.append('<h3>便利だと感じる点（Q6）</h3><p>12人の方が書いてくださいました。多かった声の順です（お1人がいくつか書いた場合は、それぞれ数えています）。</p>' + ul([
  b('転記・二度手間が減った') + '（4人）… 紙の出し入れが減った、バイタルの転記がいらない',
  b('1つにまとまっている') + '（3人）… Excelやほかのソフトをいくつも開かなくてよい',
  b('自動で入る・つながる') + '（3人）… 欠席が日誌やFAXにつながる、一度入れた情報が関連の書類に入る',
  b('記録が取りやすい・見やすい') + '（2人）… 手書きより見やすく書きやすい',
  b('そのほか') + ' … 連絡帳の印刷、モニタリングの入力、年齢や誕生日がすぐ見られる、カレンダーが見やすい、どの端末からも見られる']))
body.append('<h3>使いにくい点・困っている点（Q7）</h3><p>10人の方が書いてくださいました（うち2人は「特にない」）。いただいた声を、できるだけそのままの形でまとめました。</p>' + ul([
  'iPadを長く使っていると、時々固まることがある', '店舗の設備の関係で、不便を感じることがある', '名前と顔が一致しないことがあるので、名前の横に顔写真があると分かりやすい',
  'スマホで血圧や体温を入れるとき、縦のスクロールが多い（今も問題なく使えている、という声も添えて）', '機能が多く、皆が覚えて使いこなすまで少し時間がかかる。正しく保存できているか不安になることがある',
  '手書きのころの「殴り書きのメモ」を書くところがなく、どこに書くか迷う', 'ログインのときの手順', '説明の文字がやや多く、字が細かい']))
body.append('<h3>追加してほしい機能（Q8）</h3><p>9人の方が書いてくださいました（うち2人は「今のところない」）。ご要望は9件です。それぞれの対応は、後ろの「ご要望への対応」にまとめています。</p>' + ul([
  '提供記録で、選んだ方の行の色が変わる（何人でも選べると嬉しい）', '提供記録の特記に、お休みの理由のような選択肢', '運動の○を一括で入れたい', '体力測定に、数値のほかに特記の欄（杖・カートの使用など）',
  '送迎表に、送りの時間', '送迎の時間を変えたときのお知らせを印刷したい', '提供記録の名前の横に、自転車の高さ・マッサージの姿勢・温浴・電気の印', '名前の横に顔写真', '個別運動メニューを処方する機能']))
body.append('<h3>不具合・その他のご意見（Q9・Q10）</h3>' + ul([
  b('不具合') + '… 「送迎の順番がいつもと逆になったことがある」という声が1件ありました。ほかは「特になし」「気づいたら伝えます」でした。',
  b('感謝・応援の声') + '… 「いつもブラッシュアップありがとう」「日々の業務でとても助かっている」「これからもアップデートを頑張ってください」など、たくさんの言葉をいただきました。ありがとうございます。',
  b('使い方について') + '… スマホやiPadを見ている時間が長くなりがちなこと、個人の携帯を使うときの個人情報や私用との区別について、ご意見をいただきました（後ろの「これから本部で決めること」に入れています）。',
  b('そのほか') + '… 「使い慣れたらその都度相談したい」「何かあったら直接伝えます」という声もいただきました。']))
body.append('<h2 class="sec2">集計結果をもとにした対応</h2><p>いただいた声をもとに、本部で進めている対応です。試験版で使えるものは、店舗で確かめてから全店（安定版）に入れます。</p>')
body.append('<h3>ご要望への対応</h3><p>追加してほしい機能（Q8）9件のうち6件は試験版で入れて店舗で確かめているところ、1件は今ある機能で対応、2件は今後検討します。試験版の機能は、確かめ終わったものから安定版（全店）に入れます。</p>')
body.append('<table><tr><th style="width:30%">ご要望</th><th style="width:15%">状況</th><th>使い方・マニュアル</th></tr>' + ''.join(f'<tr><td>{esc(a)}</td><td>{pill(s)}</td><td>{esc(c)}</td></tr>' for a, s, c in REQ) + '</table>')
body.append('<p class="note">ページは「つむぎ操作マニュアル（事業所向け）」のPDFです。p.75〜92は試験版のマニュアルの24章で、それより前のページは安定版・試験版とも同じです。</p>')
body.append('<h3>使いにくい点・不具合への回答</h3><p>困っている点（Q7）と不具合（Q9）について、今のつむぎでできることと、考え方をまとめました。</p>')
body.append('<table><tr><th style="width:27%">困りごと</th><th>回答・今できること</th><th style="width:16%">マニュアル</th></tr>' + ''.join(f'<tr><td>{esc(a)}</td><td>{esc(c)}</td><td>{esc(m)}</td></tr>' for a, c, m in TRB) + '</table>')
body.append('<h3>今はできないこと・今後の予定</h3><p>今すぐは入れないのは2つです。どちらも本部で方針を決めてから進めます。</p>' + ul([
  b('個別運動メニュー（痛みなどからストレッチを探す）') + ' … 介護整体などで、痛みに合うストレッチ（お尻上げなど）を探したいというご要望です。専門の知識が要り、間違った内容を伝えると危ないため慎重に検討します。作るなら、AIで作った動画で動きを見せる形が分かりやすいと考えています。',
  b('顔写真') + ' … 10月22日の管理者ミーティングで検討します（ご家族の同意・写真の保存の決まり）。']))
body.append('<p>今後の予定：試験版の機能（行の枠と印・一言・一括○・体力測定の備考・送りの時間・連絡帳の送り時間反映・1日の運行表（A4横）など）は、店舗で確かめてから安定版に入れます。名前の横の印（自転車・マッサージの姿勢など）は、今の「ポップアップ表示」で対応します。</p>')
body.append('<h3>これから本部で決めること</h3><p>アプリの機能ではなく、使い方の決まりや店舗へのお手伝いとして、本部で考えていくことが6つあります。</p>' + '<ul class="check">' + ''.join(f'<li>{b(t)}… {esc(d)}</li>' for t, d in HQ) + '</ul>')
html_doc = f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>つむぎ職員アンケート 集計と対応</title><style>{css}</style></head><body>{"".join(body)}</body></html>'
open(out, 'w', encoding='utf-8').write(html_doc); print('ok', len(html_doc))
