# -*- coding: utf-8 -*-
# つむぎ LIFE: まるっとLIFE の Excel(1人1ファイル・CSV シート)から、つむぎ「LIFE・加算 → CSV取込(移行)」用の CSV を作る
#   実名・被保番を含むので、値は一切 print しない(構造と件数だけ)。出力先は Drive の まるっとLIFE/LIFE/つむぎ取込用/(リポジトリ外)
#   使い方: uv run --with openpyxl python -I extract.py probe   … 構造の確認(行位置・列数)
#           uv run --with openpyxl python -I extract.py build   … CSV を作る
import sys, os, glob, csv, re, hashlib
D = os.path.expanduser('~/Library/CloudStorage/GoogleDrive-bifb5624@gmail.com/マイドライブ/つむぎ/まるっとLIFE/LIFE/')
OUT = os.path.join(D, 'つむぎ取込用')
FORMS = {  # Data type の名前 → (つむぎの様式ID, 期待する列数)
  'SCIENTIFIC_NURSING_CARE_PROMOTION': ('TIFI2024', 114),
  'LIFE_FUNCTION_CHECK': ('FUNC2024', 52),
  'INDIVIDUAL_FUNCTION_TRAINING': ('IDUA2024', 103),
  'ADL_MAINTENANCE': ('AINT2024', 23),
}
def find_blocks(ws):
  """CSV シートの中で、1列目に Data type 名(英大文字)がある行を見つけ、(様式ID, 列名行, 値行, 列数) を返す。列名行=次の行、値行=その次。"""
  blocks = []
  maxr = ws.max_row
  for r in range(1, maxr + 1):
    v = ws.cell(r, 1).value
    if not isinstance(v, str): continue
    key = next((k for k in FORMS if k in v), None)
    if not key: continue
    hdr = [c.value for c in ws[r + 1]]
    while hdr and hdr[-1] in (None, ''): hdr.pop()
    val = [c.value for c in ws[r + 2]]
    val = val[:len(hdr)] + [None] * max(0, len(hdr) - len(val))
    # まるっとLIFE が作った「CSV1行」(値行の次の行・1セルに全列)があれば、そちらを優先(日付などの書式がそのまま)
    line = ws.cell(r + 3, 1).value
    if isinstance(line, str) and line.count(',') >= len(hdr) - 1:
      import io
      parsed = next(csv.reader(io.StringIO(line)))
      if len(parsed) == len(hdr): val = parsed; blocks.append((FORMS[key][0], FORMS[key][1], r, hdr, val)); continue
      else: print(f'  (CSV1行の列数 {len(parsed)} が列名 {len(hdr)} と違うので値の行を使う)')
    blocks.append((FORMS[key][0], FORMS[key][1], r, hdr, val))
  return blocks
def norm(x):
  if x is None: return ''
  if isinstance(x, float) and x.is_integer(): return str(int(x))
  s = str(x).replace('\r', '').replace('\n', ' ').strip()
  return s
def main():
  import openpyxl
  mode = sys.argv[1] if len(sys.argv) > 1 else 'probe'
  files = sorted(glob.glob(os.path.join(D, '*.xlsx')))
  print('files', len(files))
  per_form = {}
  for i, f in enumerate(files, 1):
    wb = openpyxl.load_workbook(f, data_only=True, read_only=False)
    names = wb.sheetnames
    cs = next((n for n in names if n.strip().upper() == 'CSV'), None)
    if not cs:
      print(f'#{i}: CSV シートなし sheets={len(names)}'); continue
    blocks = find_blocks(wb[cs])
    desc = ', '.join(f'{fid}@{r}:{len(hdr)}列{"" if len(hdr)==exp else "(期待"+str(exp)+")"}' for fid, exp, r, hdr, val in blocks)
    print(f'#{i}: {desc}')
    for fid, exp, r, hdr, val in blocks:
      per_form.setdefault(fid, {'hdr': [norm(h) for h in hdr], 'rows': []})
      if per_form[fid]['hdr'] != [norm(h) for h in hdr]: print(f'  !! {fid} の列名が #1 と違う')
      per_form[fid]['rows'].append([norm(v) for v in val])
  if mode == 'build':
    os.makedirs(OUT, exist_ok=True)
    for fid, d in per_form.items():
      if fid == 'AINT2024': continue  # 10/16 決定: ADL維持等は今回取り込まない
      p = os.path.join(OUT, f'つむぎ取込_{fid}_{len(d["rows"])}名.csv')
      with open(p, 'w', encoding='utf-8-sig', newline='') as fp:
        w = csv.writer(fp); w.writerow(d['hdr']); w.writerows(d['rows'])
      ins = len({row[d['hdr'].index('insured_no')] for row in d['rows']}) if 'insured_no' in d['hdr'] else '?'
      print(f'wrote {fid}: {len(d["rows"])}行 (被保番の種類 {ins}) -> {os.path.basename(p)}')
  else:
    for fid, d in per_form.items(): print(f'{fid}: {len(d["rows"])}名分・{len(d["hdr"])}列')
main()
