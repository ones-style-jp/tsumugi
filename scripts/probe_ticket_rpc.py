# -*- coding: utf-8 -*-
"""提供記録RPC(upsert_ticket_records)の合成規則を試作店舗の架空行で検証する(台帳432件目)。
   使い方: python3 scripts/probe_ticket_rpc.py
   期待(v2適用後): B/C/D で kibun が 'good' のまま残り、E(新しい時刻の明示クリア)だけ '' になる。
   架空行 tr_999999_2020_1_1 は最後に削除(deleted_at)する。実利用者データには触れない。"""
import json, urllib.request, time
KEY = "sb_publishable_2IG11GJZUGdf0t-UPg_FhQ_hAn6hin1"; BASE = "https://eopdtcfxfhshzxtqcwmy.supabase.co/rest/v1"
HDR = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
STORE = 'store_shisaku'; RID = 'tr_999999_2020_1_1'
def rpc(name, body):
    req = urllib.request.Request(f"{BASE}/rpc/{name}", data=json.dumps(body).encode(), headers=HDR, method='POST')
    try: return urllib.request.urlopen(req, timeout=60).read().decode()[:60]
    except urllib.error.HTTPError as e: return f'HTTP{e.code} ' + e.read().decode()[:160]
def read():
    req = urllib.request.Request(f"{BASE}/ticket_records?store_id=eq.{STORE}&id=eq.{RID}&select=data,deleted_at", headers=HDR)
    rows = json.loads(urllib.request.urlopen(req, timeout=60).read())
    if not rows: return None
    d = rows[0]['data'] or {}; return {'kibun': d.get('kibunArrival'), 'bp': d.get('bpUpSt_AM'), 'ft': (d.get('_fieldTs') or {}).get('kibunArrival')}
T = int(time.time() * 1000)
row = lambda data: {"p_store_id": STORE, "p_rows": [{"id": RID, "patientId": 999999, "recDate": "2020-01-01", "data": data}]}
reset = lambda: rpc('upsert_ticket_records', row({"kibunArrival": "good", "bpUpSt_AM": "120", "_fieldTs": {"kibunArrival": T, "bpUpSt_AM": T}}))
ok = True
reset(); print('A 初期(good, ts=T)          :', read())
reset(); rpc('upsert_ticket_records', row({"kibunArrival": "", "_fieldTs": {"kibunArrival": T}}));      x = read(); print('B 空を同時刻で送る          :', x); ok &= x['kibun'] == 'good'
reset(); rpc('upsert_ticket_records', row({"kibunArrival": "", "_fieldTs": {"kibunArrival": T - 1000}})); x = read(); print('C 空を古い時刻で送る        :', x); ok &= x['kibun'] == 'good'
reset(); rpc('upsert_ticket_records', row({"kibunArrival": ""}));                                        x = read(); print('D 空を時刻なしで送る        :', x); ok &= x['kibun'] == 'good'
reset(); rpc('upsert_ticket_records', row({"kibunArrival": "", "_fieldTs": {"kibunArrival": T + 1000}})); x = read(); print('E 空を新しい時刻で送る(明示):', x); ok &= x['kibun'] == ''
reset(); rpc('upsert_ticket_records', row({"kibunArrival": "bad", "_fieldTs": {"kibunArrival": T + 1000}})); x = read(); print('F 新しい値を新しい時刻で送る:', x); ok &= x['kibun'] == 'bad'
rpc('delete_ticket_record', {"p_store_id": STORE, "p_id": RID})
print('\n==== 判定:', 'OK(項目別時刻比較が有効)' if ok else 'NG(まだ後勝ち・v2 SQL未適用)', '====')
