"""Integration test against a fresh temporary BW_DATA_DIR (never a production DB)."""
import json, urllib.request, urllib.error, http.cookiejar, secrets
BASE = 'http://127.0.0.1:8088'
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf = ''
def call(path, body=None, expected=200, token=None):
    headers = {'Content-Type': 'application/json', 'X-CSRF-Token': csrf if token is None else token}
    req = urllib.request.Request(BASE+path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with client.open(req) as response: code, raw = response.status, response.read()
    except urllib.error.HTTPError as error: code, raw = error.code, error.read()
    assert code == expected, (path, code, raw.decode()[:300])
    return json.loads(raw) if raw else {}
session=call('/api/admin.php?action=session');assert session['setupRequired'];csrf=session['csrf']
call('/api/admin.php?action=list',expected=401)
assert call('/api/availability.php?month=2026-10')['days']=={}
password=secrets.token_urlsafe(24)
call('/api/admin.php?action=setup',{'username':'test-admin','password':password},expected=403,token='bad')
csrf=call('/api/admin.php?action=setup',{'username':'test-admin','password':password})['csrf']
call('/api/admin.php?action=setup',{'username':'other','password':password},expected=403)
assert call('/api/availability.php?month=2026-10')['days']['2026-10-12']['cama-g']=='available'
record={'name':'Cliente teste','phone':'41999999999','address':'Rua teste','start':'2026-10-12T09:00','end':'2026-10-13T00:00','status':'pending','kind':'rental','notes':'teste','fee':15,'toys':['cama-g']}
id=call('/api/admin.php?action=save',record)['id'];record['id']=id
call('/api/admin.php?action=save',{**record,'id':0},expected=409)
assert call('/api/admin.php?action=list')['bookings'][0]['total']==195
states=call('/api/availability.php?month=2026-10')['days'];assert states['2026-10-12']['cama-g']=='unavailable';assert states['2026-10-12']['cama-p']=='available';assert states['2026-10-13']['cama-g']=='available'
record['status']='confirmed';call('/api/admin.php?action=save',record)
record['start']='2026-10-14T09:00';record['end']='2026-10-14T18:00';call('/api/admin.php?action=save',record)
assert call('/api/availability.php?month=2026-10')['days']['2026-10-12']['cama-g']=='available'
record['status']='cancelled';call('/api/admin.php?action=save',record)
maintenance={**record,'id':0,'kind':'maintenance','status':'confirmed','name':'Limpeza','toys':['cama-p']}
call('/api/admin.php?action=save',maintenance)
states=call('/api/availability.php?month=2026-10')['days'];assert states['2026-10-14']['cama-p']=='unavailable';assert states['2026-10-14']['cama-g']=='available'
call('/api/admin.php?action=save',{**maintenance,'id':0,'end':'2026-10-01T09:00'},expected=400)
call('/api/admin.php?action=save',{**maintenance,'id':0,'toys':['inexistente']},expected=400)
call('/.private/reservas.sqlite',expected=404)
call('/bf011207',expected=404)
call('/api/admin.php?action=logout',{})
call('/api/admin.php?action=list',expected=401)
csrf=call('/api/admin.php?action=session')['csrf']
call('/api/admin.php?action=login',{'username':'test-admin','password':'wrong'},expected=401)
csrf=call('/api/admin.php?action=login',{'username':'test-admin','password':password})['csrf']
assert len(call('/api/admin.php?action=list')['bookings'])==2
call('/api/admin.php?action=logout',{})
print('OK: setup, autenticação, CSRF, CRUD, conflitos, manutenção, isolamento por brinquedo, privacidade e persistência.')
