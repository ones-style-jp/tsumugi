# -*- coding: utf-8 -*-
# 2026-11-02 エリア担当者(山口さん)が柴又店で説明するための資料「つむぎは何のために・これからどうなるか」(A4縦・図を中心に)
import os, html
R = "/Users/masabou/Library/CloudStorage/GoogleDrive-honbu@ones-style.co.jp/マイドライブ/Claude"
IMG = R + "/public/manual/img"
def img(*cands):
    for c in cands:
        p = os.path.join(IMG, c)
        if os.path.exists(p): return 'file://' + p
    return ''
I_HOME = img('staff_dashboard.jpg', 'staff_home.jpg', 'oct_tr_home.jpg')
I_REC = img('staff_record.jpg', 'oct_rec_top.jpg')
I_TP = img('staff_transport.jpg', 'oct_tp_final.jpg')
I_DIARY = img('staff_diary.jpg', 'oct_diary.jpg')
I_CB = img('staff_contact_book.jpg', 'staff_contactbook.jpg', 'oct_cb_preview.jpg')
CSS = """
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; color: #1f2937; }
  .paper { width: 210mm; height: 297mm; box-sizing: border-box; overflow: hidden; page-break-after: always; position: relative; }
  .paper:last-child { page-break-after: auto; }
  .inner { padding: 14mm 16mm 12mm; box-sizing: border-box; }
  .eyebrow { font-size: 11px; color: #5e8030; font-weight: bold; letter-spacing: 2px; }
  h1 { font-size: 22px; margin: 4px 0 2px; color: #3d5021; line-height: 1.35; }
  h2 { font-size: 16px; color: #3d5021; margin: 0 0 8px; padding: 0 0 5px 10px; border-left: 6px solid #7daa3d; }
  h3 { font-size: 13px; color: #3d5021; margin: 10px 0 4px; }
  p { font-size: 12px; line-height: 1.85; margin: 0 0 6px; }
  li { font-size: 12px; line-height: 1.8; }
  ul { margin: 0 0 6px; padding-left: 20px; }
  .meta { font-size: 11px; color: #475569; margin: 4px 0 12px; }
  .box { background: #f0f7e0; border: 1px solid #c5dea0; border-radius: 10px; padding: 10px 14px; margin: 8px 0; }
  .warn { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 10px 14px; margin: 8px 0; }
  .two { display: flex; gap: 12px; }
  .two > div { flex: 1; min-width: 0; }
  .cap { font-size: 11px; color: #475569; text-align: center; margin: 2px 0 8px; }
  .fig { margin: 6px 0 0; }
  table { border-collapse: collapse; width: 100%; font-size: 11.5px; margin: 4px 0; }
  th, td { border: 1px solid #d1d5db; padding: 5px 8px; text-align: left; vertical-align: top; line-height: 1.55; }
  th { background: #f8fafc; font-weight: bold; color: #334155; }
  .shot { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; }
  .pn { position: absolute; bottom: 8mm; right: 16mm; font-size: 10px; color: #94a3b8; }
  .big { font-size: 14px; }
  svg text { font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif; }
  .kw { font-weight: bold; color: #3d5021; }
"""
def page(n, body): return f'<div class="paper"><div class="inner">{body}</div><div class="pn">つむぎ 説明資料 {n}</div></div>'
pages = []
# ---------- P1 表紙＋使い方 ----------
pages.append(page(1, f"""
<div class="eyebrow">TSUMUGI</div>
<h1>つむぎは何のために作ったのか、これからどうなるのか</h1>
<div class="meta">2026年11月2日　株式会社ワンズスタイル 本部　　エリア担当者が店舗で説明するための資料</div>
<div class="box"><p class="big"><b>この資料の使い方</b></p>
<p>店舗で「なぜ紙からアプリに変えるのか」「会社はどこへ向かっているのか」「自分たちの声は届くのか」を話すための資料です。順番に読まなくてもかまいません。相手の疑問に合うページを開いてください。</p></div>
<h2>先に結論を3つ</h2>
<div class="fig"><svg viewBox="0 0 760 230" width="100%" height="210">
  <defs><marker id="g" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#5e8030"/></marker></defs>
  <g>
    <rect x="10" y="14" width="235" height="200" rx="14" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/>
    <text x="127" y="46" text-anchor="middle" font-size="15" font-weight="bold" fill="#3d5021">1. 紙をなくすため</text>
    <text x="127" y="78" text-anchor="middle" font-size="12" fill="#1f2937">転記・保管・探す手間をなくす</text>
    <text x="127" y="100" text-anchor="middle" font-size="12" fill="#1f2937">災害で紙が全部だめになった</text>
    <text x="127" y="122" text-anchor="middle" font-size="12" fill="#1f2937">店舗が実際にあった</text>
    <text x="127" y="160" text-anchor="middle" font-size="12" fill="#5e8030" font-weight="bold">一度入れれば、どこにも</text>
    <text x="127" y="180" text-anchor="middle" font-size="12" fill="#5e8030" font-weight="bold">書き写さなくてよい</text>
  </g>
  <g>
    <rect x="262" y="14" width="235" height="200" rx="14" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/>
    <text x="379" y="46" text-anchor="middle" font-size="15" font-weight="bold" fill="#3d5021">2. 現場で生まれた</text>
    <text x="379" y="78" text-anchor="middle" font-size="12" fill="#1f2937">店舗の管理者が自分の店の</text>
    <text x="379" y="100" text-anchor="middle" font-size="12" fill="#1f2937">仕事を楽にするために作り、</text>
    <text x="379" y="122" text-anchor="middle" font-size="12" fill="#1f2937">会社の柱になった</text>
    <text x="379" y="160" text-anchor="middle" font-size="12" fill="#5e8030" font-weight="bold">作った本人に、今なら</text>
    <text x="379" y="180" text-anchor="middle" font-size="12" fill="#5e8030" font-weight="bold">直接「こうしてほしい」が届く</text>
  </g>
  <g>
    <rect x="514" y="14" width="235" height="200" rx="14" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/>
    <text x="631" y="46" text-anchor="middle" font-size="15" font-weight="bold" fill="#3d5021">3. これからも増える</text>
    <text x="631" y="78" text-anchor="middle" font-size="12" fill="#1f2937">LIFE（加算）の提出、請求、</text>
    <text x="631" y="100" text-anchor="middle" font-size="12" fill="#1f2937">ケアプランデータ連携まで</text>
    <text x="631" y="122" text-anchor="middle" font-size="12" fill="#1f2937">つむぎ1つにまとめていく</text>
    <text x="631" y="160" text-anchor="middle" font-size="12" fill="#5e8030" font-weight="bold">早く慣れた店舗ほど</text>
    <text x="631" y="180" text-anchor="middle" font-size="12" fill="#5e8030" font-weight="bold">楽になる時期が早い</text>
  </g>
</svg></div>
<h2>この資料の内容</h2>
<table>
<tr><th style="width:9%">ページ</th><th>内容</th><th style="width:38%">こんなときに</th></tr>
<tr><td>2</td><td>なぜ紙からアプリへ</td><td>「紙のままでよくないか」と言われたら</td></tr>
<tr><td>3</td><td>つむぎの成り立ちと、会社の方向</td><td>「本部が勝手に決めた」と思われているとき</td></tr>
<tr><td>4</td><td>1日の仕事がどう変わるか</td><td>「結局入力が増えるのでは」と言われたら</td></tr>
<tr><td>5</td><td>現場の声で変わってきたこと</td><td>「自分のやり方と合わない」と言われたら</td></tr>
<tr><td>6</td><td>困ったときの窓口（役割分担）</td><td>「誰に聞けばいいか分からない」と言われたら</td></tr>
<tr><td>7</td><td>これからの予定（ガントチャート）</td><td>「先に何があるのか」を見せるとき</td></tr>
<tr><td>8</td><td>よくある不安への答え</td><td>話の最後に</td></tr>
</table>
"""))
# ---------- P2 紙からアプリへ ----------
pages.append(page(2, f"""
<h2>1. なぜ紙からアプリへ</h2>
<p>介護の現場は紙が多い仕事です。提供記録、連絡帳、日誌、送迎表、計画書、モニタリング。同じことを何か所にも書き写し、綴じて、探して、保管します。</p>
<div class="fig"><svg viewBox="0 0 760 250" width="100%" height="230">
  <defs><marker id="g2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#5e8030"/></marker></defs>
  <text x="130" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#9a3412">紙のとき</text>
  <rect x="20" y="34" width="220" height="42" rx="8" fill="#fff7ed" stroke="#fdba74"/><text x="130" y="60" text-anchor="middle" font-size="12" fill="#7c2d12">同じことを何度も書き写す</text>
  <rect x="20" y="86" width="220" height="42" rx="8" fill="#fff7ed" stroke="#fdba74"/><text x="130" y="112" text-anchor="middle" font-size="12" fill="#7c2d12">綴じる・探す・保管場所をとる</text>
  <rect x="20" y="138" width="220" height="42" rx="8" fill="#fff7ed" stroke="#fdba74"/><text x="130" y="164" text-anchor="middle" font-size="12" fill="#7c2d12">字がちがう・読めない・抜ける</text>
  <rect x="20" y="190" width="220" height="42" rx="8" fill="#fff7ed" stroke="#fdba74"/><text x="130" y="216" text-anchor="middle" font-size="12" fill="#7c2d12">水害・火事で全部なくなる</text>
  <line x1="250" y1="130" x2="330" y2="130" stroke="#5e8030" stroke-width="3" marker-end="url(#g2)"/>
  <rect x="340" y="40" width="400" height="180" rx="16" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/>
  <text x="540" y="70" text-anchor="middle" font-size="14" font-weight="bold" fill="#3d5021">つむぎ（1か所に入れる）</text>
  <text x="540" y="100" text-anchor="middle" font-size="12" fill="#1f2937">一度入れた記録が、連絡帳・日誌・計画書・加算の提出に流れる</text>
  <text x="540" y="124" text-anchor="middle" font-size="12" fill="#1f2937">iPad・スマホ・パソコンのどれからでも、同じものが見える</text>
  <text x="540" y="148" text-anchor="middle" font-size="12" fill="#1f2937">クラウドに保存。端末が壊れても、店が水につかっても残る</text>
  <text x="540" y="172" text-anchor="middle" font-size="12" fill="#1f2937">文章の下書きや要約はAIが手伝う</text>
  <text x="540" y="200" text-anchor="middle" font-size="12" font-weight="bold" fill="#5e8030">浮いた時間を、利用者さんと過ごす時間に</text>
</svg></div>
<div class="warn"><p><b>実際にあったこと</b>　フランチャイズの店舗（さくら）で浸水があり、紙の記録がすべて使えなくなりました。記録は事業の根拠そのものです。つむぎに入れた記録はクラウドにあるので、店の被害とは切り離して残ります。</p></div>
<h3>つむぎで紙が減るもの</h3>
<table>
<tr><th style="width:26%">紙だったもの</th><th>つむぎでは</th></tr>
<tr><td>サービス提供記録</td><td>iPadで○を押す・数字を入れる。体調は色で見える。次の画面（連絡帳・日誌）に自動で流れる</td></tr>
<tr><td>連絡帳</td><td>提供記録から自動で下書き。印刷もご家族のスマホでの閲覧も同じ内容</td></tr>
<tr><td>日誌</td><td>送迎表と提供記録から自動で埋まる。足りないところだけ書く</td></tr>
<tr><td>送迎表</td><td>基本利用日から自動で下書き。車・順番・時間を動かすだけ。座席表も出る</td></tr>
<tr><td>計画書・モニタリング</td><td>前回の内容を写して直す。モニタリングはAIが下書き。ケアマネへFAXまでつながる</td></tr>
<tr><td>LIFE（加算）の提出</td><td>入れた記録から提出用ファイルを作る（扇橋店で11月から本提出）</td></tr>
</table>
"""))
# ---------- P3 成り立ちと会社の方向 ----------
pages.append(page(3, f"""
<h2>2. つむぎの成り立ちと、会社の方向</h2>
<div class="fig"><svg viewBox="0 0 760 170" width="100%" height="160">
  <defs><marker id="g3" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#5e8030"/></marker></defs>
  <rect x="10" y="30" width="220" height="110" rx="12" fill="#fff" stroke="#94a3b8" stroke-width="2"/>
  <text x="120" y="58" text-anchor="middle" font-size="13" font-weight="bold" fill="#334155">はじまり</text>
  <text x="120" y="84" text-anchor="middle" font-size="12" fill="#1f2937">店舗の管理者（髙橋）が</text>
  <text x="120" y="104" text-anchor="middle" font-size="12" fill="#1f2937">自分の店の仕事を楽にするために</text>
  <text x="120" y="124" text-anchor="middle" font-size="12" fill="#1f2937">自分で作りはじめた</text>
  <line x1="238" y1="85" x2="268" y2="85" stroke="#5e8030" stroke-width="3" marker-end="url(#g3)"/>
  <rect x="275" y="30" width="220" height="110" rx="12" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/>
  <text x="385" y="58" text-anchor="middle" font-size="13" font-weight="bold" fill="#3d5021">会社のものに</text>
  <text x="385" y="84" text-anchor="middle" font-size="12" fill="#1f2937">社長が「これは全店で使える」</text>
  <text x="385" y="104" text-anchor="middle" font-size="12" fill="#1f2937">と判断し、2026年10月に</text>
  <text x="385" y="124" text-anchor="middle" font-size="12" fill="#1f2937">正式版として全店へ</text>
  <line x1="503" y1="85" x2="533" y2="85" stroke="#5e8030" stroke-width="3" marker-end="url(#g3)"/>
  <rect x="540" y="30" width="210" height="110" rx="12" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/>
  <text x="645" y="58" text-anchor="middle" font-size="13" font-weight="bold" fill="#3d5021">フランチャイズの柱に</text>
  <text x="645" y="84" text-anchor="middle" font-size="12" fill="#1f2937">加盟店に毎月届ける</text>
  <text x="645" y="104" text-anchor="middle" font-size="12" fill="#1f2937">「価値」として、</text>
  <text x="645" y="124" text-anchor="middle" font-size="12" fill="#1f2937">改善を続けていく</text>
</svg></div>
<h3>なぜ「月額のサービス」にするのか</h3>
<p>フランチャイズ展開をはじめたころ、本部の収入は加盟金だけの予定でした。しかし加盟金だけでは、最初に払って終わり、その後のつき合いが続きません。毎月同じ金額をいただく代わりに、毎月役に立つものを届け続ける。その「届け続けるもの」がつむぎです。</p>
<div class="two">
<div class="box"><p><b>加盟店にとって</b></p>
<ul><li>紙の保管場所も転記の手間もいらない</li><li>記録・連絡帳・日誌・送迎・計画書・加算の提出が1つにまとまる</li><li>困ったことは直して返ってくる（月額の中に改善が含まれる）</li></ul></div>
<div class="box"><p><b>会社にとって</b></p>
<ul><li>店舗が増えるほど、本部と店舗の関係が長く続く</li><li>全店が同じやり方になるので、研修・引き継ぎ・監査対応が楽になる</li><li>記録がそろうので、加算や請求の取りこぼしが減る</li></ul></div>
</div>
<h3>つむぎがめざすところ</h3>
<p>記録のアプリで終わらせず、<span class="kw">LIFE（加算）の提出</span>、<span class="kw">請求</span>、<span class="kw">ケアプランデータ連携</span>まで1つで済む形にしていきます。それぞれがバラバラのソフトだと、同じ利用者の情報を何度も登録することになります。つむぎに一度入れたものが全部に使われる。それが提供したい価値です。</p>
"""))
# ---------- P4 1日の流れ ----------
shots = ''.join(f'<div><img class="shot" src="{s}"/><div class="cap">{c}</div></div>' for s, c in ((I_REC, '提供記録（○を押す・数字を入れる）'), (I_DIARY, '日誌（送迎表と記録から自動で埋まる）')) if s)
pages.append(page(4, f"""
<h2>3. 1日の仕事がどう変わるか</h2>
<p>「入力が増えるだけでは」という心配に、いちばん効く説明です。つむぎは<b>最初の1回だけ入力し、あとは流れる</b>ように作ってあります。</p>
<div class="fig"><svg viewBox="0 0 760 200" width="100%" height="190">
  <defs><marker id="g4" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#5e8030"/></marker></defs>
  <g><rect x="10" y="20" width="135" height="80" rx="10" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/><text x="77" y="48" text-anchor="middle" font-size="12" font-weight="bold" fill="#3d5021">朝：送迎表</text><text x="77" y="70" text-anchor="middle" font-size="11" fill="#1f2937">基本利用日から下書き</text><text x="77" y="88" text-anchor="middle" font-size="11" fill="#1f2937">車と順番を動かす</text></g>
  <line x1="150" y1="60" x2="178" y2="60" stroke="#5e8030" stroke-width="2.5" marker-end="url(#g4)"/>
  <g><rect x="185" y="20" width="135" height="80" rx="10" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/><text x="252" y="48" text-anchor="middle" font-size="12" font-weight="bold" fill="#3d5021">日中：提供記録</text><text x="252" y="70" text-anchor="middle" font-size="11" fill="#1f2937">体温・血圧・運動に○</text><text x="252" y="88" text-anchor="middle" font-size="11" fill="#1f2937">特記は一言＋音声でも</text></g>
  <line x1="325" y1="60" x2="353" y2="60" stroke="#5e8030" stroke-width="2.5" marker-end="url(#g4)"/>
  <g><rect x="360" y="20" width="135" height="80" rx="10" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/><text x="427" y="48" text-anchor="middle" font-size="12" font-weight="bold" fill="#3d5021">帰り：連絡帳</text><text x="427" y="70" text-anchor="middle" font-size="11" fill="#1f2937">記録から自動で下書き</text><text x="427" y="88" text-anchor="middle" font-size="11" fill="#1f2937">印刷・家族のスマホへ</text></g>
  <line x1="500" y1="60" x2="528" y2="60" stroke="#5e8030" stroke-width="2.5" marker-end="url(#g4)"/>
  <g><rect x="535" y="20" width="135" height="80" rx="10" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/><text x="602" y="48" text-anchor="middle" font-size="12" font-weight="bold" fill="#3d5021">夕方：日誌</text><text x="602" y="70" text-anchor="middle" font-size="11" fill="#1f2937">送迎・出席・体調が</text><text x="602" y="88" text-anchor="middle" font-size="11" fill="#1f2937">自動で入っている</text></g>
  <path d="M77,100 L77,150 L690,150 L690,100" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5 4"/>
  <rect x="200" y="135" width="360" height="30" rx="8" fill="#fff" stroke="#94a3b8"/><text x="380" y="155" text-anchor="middle" font-size="11.5" fill="#334155">月末：計画書・モニタリング・LIFE提出にも、同じ記録が使われる</text>
  <text x="380" y="190" text-anchor="middle" font-size="12" font-weight="bold" fill="#5e8030">紙のときに4〜5回書いていたことが、1回になる</text>
</svg></div>
<div class="two">{shots}</div>
<div class="box"><p><b>AIが手伝うところ</b>　モニタリングの文章の下書き、計画書の定型文、特記の音声入力。書く量そのものを減らします。書いた内容の責任は職員にあるので、最後に目を通して直す前提です。</p></div>
"""))
# ---------- P5 現場の声 ----------
pages.append(page(5, f"""
<h2>4. 現場の声で変わってきたこと</h2>
<p>つむぎは「作って終わり」ではありません。店舗からの声は、数日から数週間で画面に反映されています。「自分のやり方と合わない」は、直す対象です。</p>
<div class="two">
<div><div class="box"><p><b>職員アンケート（10月16日〜20日・7店舗・15人）</b></p>
<ul><li>満足以上：12人</li><li>紙のころより楽になった：13人</li><li>いただいた声は「アンケート結果のアップデート」として10月22日に全店へ反映</li></ul></div></div>
<div><div class="box"><p><b>店舗の声から入った機能（一部）</b></p>
<ul><li>提供記録：入力中の行に色が付く・名前の長押しで印（見失わない）</li><li>提供記録：並び替えを曜日・午前午後ごとに覚える</li><li>運動の一括○・特記の一言とマイク</li><li>テンキーを閉じたら色も消える（iPad）</li><li>スマホ用の提供記録・体力測定の画面</li></ul></div></div>
</div>
<h3>直してきた流れ（例）</h3>
<div class="fig"><svg viewBox="0 0 760 120" width="100%" height="110">
  <defs><marker id="g5" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#5e8030"/></marker></defs>
  <rect x="10" y="20" width="170" height="70" rx="10" fill="#fff" stroke="#94a3b8" stroke-width="2"/><text x="95" y="48" text-anchor="middle" font-size="12" font-weight="bold" fill="#334155">店舗の声</text><text x="95" y="70" text-anchor="middle" font-size="11" fill="#1f2937">「どの行を入れていたか</text><text x="95" y="84" text-anchor="middle" font-size="11" fill="#1f2937">分からなくなる」</text>
  <line x1="185" y1="55" x2="215" y2="55" stroke="#5e8030" stroke-width="2.5" marker-end="url(#g5)"/>
  <rect x="222" y="20" width="170" height="70" rx="10" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/><text x="307" y="48" text-anchor="middle" font-size="12" font-weight="bold" fill="#3d5021">本部で作る</text><text x="307" y="70" text-anchor="middle" font-size="11" fill="#1f2937">入力中の行に色・</text><text x="307" y="84" text-anchor="middle" font-size="11" fill="#1f2937">長押しで印</text>
  <line x1="397" y1="55" x2="427" y2="55" stroke="#5e8030" stroke-width="2.5" marker-end="url(#g5)"/>
  <rect x="434" y="20" width="150" height="70" rx="10" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/><text x="509" y="48" text-anchor="middle" font-size="12" font-weight="bold" fill="#3d5021">試験版で試す</text><text x="509" y="70" text-anchor="middle" font-size="11" fill="#1f2937">扇橋店などで</text><text x="509" y="84" text-anchor="middle" font-size="11" fill="#1f2937">数日使ってみる</text>
  <line x1="589" y1="55" x2="619" y2="55" stroke="#5e8030" stroke-width="2.5" marker-end="url(#g5)"/>
  <rect x="626" y="20" width="124" height="70" rx="10" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2"/><text x="688" y="48" text-anchor="middle" font-size="12" font-weight="bold" fill="#3d5021">全店へ</text><text x="688" y="70" text-anchor="middle" font-size="11" fill="#1f2937">お知らせつきで</text><text x="688" y="84" text-anchor="middle" font-size="11" fill="#1f2937">自動で更新</text>
</svg></div>
<div class="warn"><p class="big"><b>今はじめることの意味</b></p>
<p>今は、作った本人（髙橋）に「ここが使いにくい」が直接届き、数日で直る時期です。フランチャイズの店舗が増えると、要望はまとめて順番に扱う形になります。<b>自分の店に合わせて直してもらえるのは今のうち</b>です。紙のやり方に合わせてつむぎを変えることもできます。遠慮なく声を出してください。</p></div>
<h3>声の出し方</h3>
<ul><li>画面の左メニュー「不具合を運営に報告」から（画面の写真を付けられます）</li><li>エリア担当者に口頭・LINEで。エリア担当者が本部へまとめて伝えます（次のページ）</li></ul>
"""))
# ---------- P6 役割分担 ----------
pages.append(page(6, f"""
<h2>5. 困ったときの窓口（役割分担）</h2>
<p>店舗と本部のあいだに、エリア担当者が入ります。「誰に言えばいいか分からない」をなくすための形です。</p>
<div class="fig"><svg viewBox="0 0 760 300" width="100%" height="280">
  <defs><marker id="g6" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#5e8030"/></marker><marker id="o6" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#c2410c"/></marker></defs>
  <rect x="10" y="40" width="200" height="220" rx="14" fill="#fff" stroke="#94a3b8" stroke-width="2"/>
  <text x="110" y="70" text-anchor="middle" font-size="14" font-weight="bold" fill="#334155">店舗</text>
  <text x="110" y="100" text-anchor="middle" font-size="11.5" fill="#1f2937">毎日の記録・連絡帳・日誌</text>
  <text x="110" y="122" text-anchor="middle" font-size="11.5" fill="#1f2937">送迎表・計画書</text>
  <text x="110" y="160" text-anchor="middle" font-size="11.5" fill="#1f2937">困ったこと・直してほしいこと</text>
  <text x="110" y="182" text-anchor="middle" font-size="11.5" fill="#1f2937">を伝える</text>
  <text x="110" y="230" text-anchor="middle" font-size="11" fill="#64748b">「不具合を運営に報告」も使える</text>
  <line x1="215" y1="120" x2="268" y2="120" stroke="#5e8030" stroke-width="3" marker-end="url(#g6)"/>
  <line x1="268" y1="180" x2="215" y2="180" stroke="#c2410c" stroke-width="3" marker-end="url(#o6)"/>
  <rect x="275" y="40" width="210" height="220" rx="14" fill="#f0f7e0" stroke="#7daa3d" stroke-width="2.5"/>
  <text x="380" y="70" text-anchor="middle" font-size="14" font-weight="bold" fill="#3d5021">エリア担当者</text>
  <text x="380" y="96" text-anchor="middle" font-size="13" font-weight="bold" fill="#3d5021">山口さん・山田さん</text>
  <text x="380" y="126" text-anchor="middle" font-size="11.5" fill="#1f2937">店舗の相談の最初の窓口</text>
  <text x="380" y="148" text-anchor="middle" font-size="11.5" fill="#1f2937">使い方の説明・研修・立ち上げ</text>
  <text x="380" y="170" text-anchor="middle" font-size="11.5" fill="#1f2937">声をまとめて本部へ</text>
  <text x="380" y="192" text-anchor="middle" font-size="11.5" fill="#1f2937">直った内容を店舗へ伝える</text>
  <text x="380" y="232" text-anchor="middle" font-size="11" fill="#64748b">フランチャイズが増えたら</text>
  <text x="380" y="248" text-anchor="middle" font-size="11" fill="#64748b">この役目がいちばん大きくなる</text>
  <line x1="490" y1="120" x2="543" y2="120" stroke="#5e8030" stroke-width="3" marker-end="url(#g6)"/>
  <line x1="543" y1="180" x2="490" y2="180" stroke="#c2410c" stroke-width="3" marker-end="url(#o6)"/>
  <rect x="550" y="40" width="200" height="220" rx="14" fill="#fff" stroke="#94a3b8" stroke-width="2"/>
  <text x="650" y="70" text-anchor="middle" font-size="14" font-weight="bold" fill="#334155">本部（髙橋）</text>
  <text x="650" y="100" text-anchor="middle" font-size="11.5" fill="#1f2937">つむぎを作る・直す</text>
  <text x="650" y="122" text-anchor="middle" font-size="11.5" fill="#1f2937">試験版で試してから全店へ</text>
  <text x="650" y="160" text-anchor="middle" font-size="11.5" fill="#1f2937">マニュアル・お知らせ</text>
  <text x="650" y="182" text-anchor="middle" font-size="11.5" fill="#1f2937">データの保護と控え</text>
  <text x="650" y="230" text-anchor="middle" font-size="11" fill="#64748b">急ぎの不具合は直接でも可</text>
  <text x="240" y="108" text-anchor="middle" font-size="10.5" fill="#5e8030">相談・要望</text>
  <text x="240" y="200" text-anchor="middle" font-size="10.5" fill="#c2410c">答え・やり方</text>
  <text x="516" y="108" text-anchor="middle" font-size="10.5" fill="#5e8030">まとめて伝える</text>
  <text x="516" y="200" text-anchor="middle" font-size="10.5" fill="#c2410c">直したもの</text>
</svg></div>
<table>
<tr><th style="width:30%">こんなとき</th><th>まず</th><th style="width:30%">それでも困ったら</th></tr>
<tr><td>使い方が分からない</td><td>エリア担当者・マニュアル（アプリ内）</td><td>本部</td></tr>
<tr><td>こう変えてほしい</td><td>エリア担当者（まとめて本部へ）</td><td>「不具合を運営に報告」から直接</td></tr>
<tr><td>画面がおかしい・保存できない</td><td>「不具合を運営に報告」（写真つき）</td><td>本部へ電話</td></tr>
<tr><td>データが消えた・見えない</td><td>さわらずに本部へ連絡</td><td>—（本部が控えから戻します）</td></tr>
</table>
<p style="font-size:11px;color:#475569">※ 山口さん・山田さんの担当店舗は口頭でお伝えください。</p>
"""))
# ---------- P7 ガント ----------
# 2026/11 〜 2027/6 の8か月。1か月=84px、左の見出し 190px
months = ['2026/11', '12', '2027/1', '2', '3', '4', '5', '6']
X0, MW = 235, 66
def xm(m):  # m: 0=2026/11 の月初、小数で月内の位置
    return X0 + m * MW
bars = [
  ('LIFE（加算）の提出', [(0, 0.3, '11/10', '#7daa3d'), (1, 0.3, '12/10', '#7daa3d'), (2, 1.0, '1月 全店', '#7daa3d'), (3, 5.0, '毎月提出（評価は3か月ごと）', '#c5dea0')]),
  ('まるっとLIFEの解約', [(2.5, 0.5, '1月末 目安', '#f59e0b')]),
  ('一人ずつのログイン・職員PIN', [(0.67, 1.0, '11/21〜 全店', '#7daa3d')]),
  ('送迎表の要望対応', [(0, 0.93, '〜11/28', '#7daa3d')]),
  ('V1.1 配信', [(1.0, 0.25, '12/1', '#3d5021')]),
  ('電子契約・同意書・メール通知', [(0, 1.4, '作る', '#c5dea0'), (1.5, 1.0, '扇橋で試す', '#c5dea0'), (2.5, 0.3, 'V1.2 1/13', '#3d5021')]),
  ('請求（国保連・実績）の連携', [(2, 2.0, '設計・準備', '#fde68a'), (4, 2.0, '作る・試す（時期は調整中）', '#fcd34d')]),
  ('ケアプランデータ連携（処遇改善加算の要件）', [(3, 2.0, '調査・申請', '#fde68a'), (5, 2.0, '連携を作る（時期は調整中）', '#fcd34d')]),
  ('柴又・立石・池上の立ち上げ', [(0, 2.0, '11〜12月 店舗ごとに', '#94c456')]),
  ('全店の定着フォロー', [(2, 2.0, '1〜2月', '#c5dea0')]),
  ('カイポケの解約', [(7, 1.0, '6月〜 目安', '#f59e0b')]),
]
rows_svg = []
y = 46
for label, segs in bars:
    rows_svg.append(f'<text x="10" y="{y+15}" font-size="11.5" font-weight="bold" fill="#1f2937">{html.escape(label)}</text>')
    for (m, w, t, col) in segs:
        x = xm(m); ww = w * MW
        tx = '#fff' if col in ('#7daa3d', '#3d5021', '#94c456') else '#1f2937'
        rows_svg.append(f'<rect x="{x:.0f}" y="{y}" width="{max(ww,6):.0f}" height="22" rx="5" fill="{col}"/>')
        label_x = x + 6 if ww >= 60 else x + ww + 4
        anchor = 'start'
        rows_svg.append(f'<text x="{label_x:.0f}" y="{y+15}" font-size="10" fill="{tx if ww >= 60 else "#1f2937"}" text-anchor="{anchor}">{html.escape(t)}</text>')
    y += 34
H = y + 10
grid = ''.join(f'<line x1="{xm(i)}" y1="30" x2="{xm(i)}" y2="{H-6}" stroke="#e5e7eb"/><text x="{xm(i)+MW/2}" y="22" text-anchor="middle" font-size="11" fill="#475569">{m}</text>' for i, m in enumerate(months))
today_x = xm(0 + 2/30)
gantt = f'<svg viewBox="0 0 {X0+MW*8+10} {H}" width="100%" height="{int(H*0.95)}">{grid}<line x1="{today_x:.0f}" y1="30" x2="{today_x:.0f}" y2="{H-6}" stroke="#c2410c" stroke-width="2" stroke-dasharray="4 3"/><text x="{today_x+4:.0f}" y="40" font-size="10" fill="#c2410c">今日 11/2</text>{"".join(rows_svg)}</svg>'
pages.append(page(7, f"""
<h2>6. これからの予定（2026年11月〜2027年6月）</h2>
<p>緑＝つむぎで進める予定、黄＝時期を調整中、橙＝他社ソフトの解約の目安。店舗に関係が深いのは「一人ずつのログイン」「LIFE」「請求」です。</p>
<div class="fig">{gantt}</div>
<table>
<tr><th style="width:30%">予定</th><th>店舗にとっての意味</th></tr>
<tr><td>一人ずつのログイン・職員PIN（11/21〜）</td><td>みんなで使うiPadはPINで自分に切り替え。自分のスマホは指紋・顔で入れる。誰が記録したかが残る</td></tr>
<tr><td>LIFE（加算）の提出</td><td>扇橋店で11月・12月に本提出して確かめ、1月から全店。まるっとLIFEへの二重入力がなくなる</td></tr>
<tr><td>請求（国保連・実績）の連携</td><td>提供記録の出席がそのまま実績に。カイポケへの入力を減らし、将来はやめる</td></tr>
<tr><td>ケアプランデータ連携</td><td>ケアマネとの計画書・実績のやりとりを電子で。処遇改善加算の要件（生産性向上の取り組み）にもつながる</td></tr>
<tr><td>電子契約・同意書</td><td>契約・重説・同意書を画面で。利用者登録と同時に個人ファイルへ</td></tr>
</table>
<p style="font-size:11px;color:#475569">※ 請求とケアプランデータ連携は制度・外部システムの都合があるため、時期は確定次第お知らせします。</p>
"""))
# ---------- P8 Q&A ----------
pages.append(page(8, f"""
<h2>7. よくある不安への答え</h2>
<table>
<tr><th style="width:32%">不安・反対</th><th>答え方</th></tr>
<tr><td>紙に慣れている。今のやり方でできている</td><td>いきなり全部変えなくてよいです。まず提供記録だけ、1週間つむぎで。慣れた画面から広げます。紙と併用の期間も認めます</td></tr>
<tr><td>自分のやり方と合わない</td><td>合わないところを具体的に聞かせてください。並び順・表示の有無・項目は店舗ごとに設定できます。設定でできなければ本部が直します（10月だけで店舗の声から20件以上）</td></tr>
<tr><td>入力が増えるのでは</td><td>一度入れれば連絡帳・日誌・計画書・加算に流れます。紙で4〜5回書いていたことが1回になります（4ページ）</td></tr>
<tr><td>機械が苦手</td><td>○を押す・数字を入れるが中心です。文章は音声でも入れられ、AIが下書きします。エリア担当者が隣で一緒に最初の数日をやります</td></tr>
<tr><td>通信が切れたら／iPadが壊れたら</td><td>入力は端末に控えられ、通信が戻ると自動で送られます。記録はクラウドにあるので、端末が壊れても別の端末で続きができます</td></tr>
<tr><td>データが消えないか</td><td>クラウドには5分ごとの控えが7日分、さらに毎日の控えがあります。万一のときは本部が控えから戻します</td></tr>
<tr><td>ご家族に見せて大丈夫か</td><td>ご家族・ケアマネには、店舗が公開した内容だけが見えます。公開する前に職員が目を通します</td></tr>
<tr><td>誰に聞けばいいのか</td><td>エリア担当者（山口さん・山田さん）が窓口です。急ぎの不具合は「不具合を運営に報告」から本部へ直接も可（6ページ）</td></tr>
<tr><td>なぜ今なのか</td><td>作った本人に直接声が届き、数日で直る時期だからです。店舗が増えると順番待ちになります（5ページ）</td></tr>
</table>
<div class="box"><p class="big"><b>最後に伝えてほしいこと</b></p>
<p>つむぎは本部が店舗を管理するための道具ではなく、現場の管理者が自分の仕事を楽にするために作ったものです。使いにくいところは、使う人の声で直していきます。まず1つの画面から、一緒にはじめましょう。</p></div>
<p style="font-size:11px;color:#475569;margin-top:10px">お問い合わせ：本部（髙橋）　support@ones-style.co.jp　　参考：職員アンケートの集計と対応（10月21日）、操作マニュアル（アプリ内の「マニュアル」から）</p>
"""))
HTML = f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>つむぎ 説明資料 2026-11-02</title><style>{CSS}</style></head><body>{"".join(pages)}</body></html>'
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'briefing.html')
open(out, 'w', encoding='utf-8').write(HTML); print('html ok', len(pages), 'pages', 'imgs', bool(I_REC), bool(I_DIARY))
