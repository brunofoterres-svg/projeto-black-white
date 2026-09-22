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
states=call('/api/availability.php?month=2026-10')['days'];assert states['2026-10-12']['cama-g']=='unavailable';assert states['2026-10-12']['cama-p']=='available';assert states['2026-10-13']['cama-g']=='unavailable'
assert call('/api/admin.php?action=list')['turnaroundMinutes']==120
adjacent={**record,'id':0,'start':'2026-10-13T01:59','end':'2026-10-13T10:00'}
call('/api/admin.php?action=save',adjacent,expected=409)
adjacent['start']='2026-10-13T02:00'
adjacent['id']=call('/api/admin.php?action=save',adjacent)['id']
call('/api/admin.php?action=settings',{'turnaroundMinutes':121},expected=409)
assert call('/api/admin.php?action=list')['turnaroundMinutes']==120
call('/api/admin.php?action=save',{**adjacent,'start':'2026-10-13T01:59'},expected=409)
saved=next(r for r in call('/api/admin.php?action=list')['bookings'] if r['id']==adjacent['id'])
assert saved['start']=='2026-10-13T02:00', 'edição conflitante deve preservar o registro'
adjacent['status']='cancelled';call('/api/admin.php?action=save',adjacent)
call('/api/admin.php?action=settings',{'turnaroundMinutes':0})
assert call('/api/availability.php?month=2026-10')['days']['2026-10-13']['cama-g']=='available'
call('/api/admin.php?action=settings',{'turnaroundMinutes':120})
record['status']='confirmed';call('/api/admin.php?action=save',record)
record['start']='2026-10-14T09:00';record['end']='2026-10-14T18:00';call('/api/admin.php?action=save',record)
assert call('/api/availability.php?month=2026-10')['days']['2026-10-12']['cama-g']=='available'
record['status']='cancelled';call('/api/admin.php?action=save',record)
maintenance={**record,'id':0,'kind':'maintenance','status':'confirmed','name':'Limpeza','toys':['cama-p']}
call('/api/admin.php?action=save',maintenance)
call('/api/admin.php?action=save',{**maintenance,'id':0,'toys':['cama-p','piscina']},expected=409)
assert len(call('/api/admin.php?action=list')['bookings'])==3, 'conflito não pode salvar parcialmente'
states=call('/api/availability.php?month=2026-10')['days'];assert states['2026-10-14']['cama-p']=='unavailable';assert states['2026-10-14']['cama-g']=='available'
public=call('/api/availability.php?month=2026-10')
assert all(set(item)=={'toy','start','end'} for item in public['schedule']['busy'])
assert 'Cliente teste' not in json.dumps(public) and 'Rua teste' not in json.dumps(public)
call('/api/admin.php?action=save',{**maintenance,'id':0,'end':'2026-10-01T09:00'},expected=400)
call('/api/admin.php?action=save',{**maintenance,'id':0,'toys':['inexistente']},expected=400)
call('/.private/reservas.sqlite',expected=404)
call('/bf011207',expected=404)
call('/api/admin.php?action=logout',{})
call('/api/admin.php?action=list',expected=401)
csrf=call('/api/admin.php?action=session')['csrf']
call('/api/admin.php?action=login',{'username':'test-admin','password':'wrong'},expected=401)
csrf=call('/api/admin.php?action=login',{'username':'test-admin','password':password})['csrf']
assert len(call('/api/admin.php?action=list')['bookings'])==3
# Confirmações são verificadas no servidor, mesmo com dados antigos no painel.
confirmed={**record,'id':0,'status':'confirmed','start':'2026-10-31T16:00','end':'2026-10-31T23:00'}
confirmed['id']=call('/api/admin.php?action=save',confirmed)['id']
call('/api/admin.php?action=save',{**confirmed,'id':0},expected=409)
before={**confirmed,'id':0,'start':'2026-10-31T12:00','end':'2026-10-31T14:01'}
call('/api/admin.php?action=save',before,expected=409)
before['end']='2026-10-31T14:00'
call('/api/admin.php?action=save',before)
after={**confirmed,'id':0,'start':'2026-11-01T00:59','end':'2026-11-01T09:00'}
call('/api/admin.php?action=save',after,expected=409)
after['start']='2026-11-01T01:00'
call('/api/admin.php?action=save',after)
call('/api/admin.php?action=save',{**confirmed,'id':0,'toys':['piscina']})
cancelled={**confirmed,'id':0,'status':'cancelled'}
cancelled['id']=call('/api/admin.php?action=save',cancelled)['id']
call('/api/admin.php?action=save',{**cancelled,'status':'confirmed'},expected=409)
saved=next(r for r in call('/api/admin.php?action=list')['bookings'] if r['id']==cancelled['id'])
assert saved['status']=='cancelled', 'reativação conflitante deve manter cancelamento'
november=call('/api/availability.php?month=2026-11')
assert {'toy':'cama-g','start':'2026-10-31T16:00','end':'2026-11-01T01:00'} in november['schedule']['busy']
assert november['days']['2026-11-01']['cama-g']=='unavailable'
# Manutenção termina no horário informado, sem somar outra margem de transporte.
after_maintenance={**record,'id':0,'status':'confirmed','toys':['cama-p'],'start':'2026-10-14T18:00','end':'2026-10-14T19:00'}
call('/api/admin.php?action=save',after_maintenance)
call('/api/admin.php?action=save',{**after_maintenance,'id':0,'start':'2026-10-14T17:59'},expected=409)
call('/api/admin.php?action=logout',{})
print('OK: setup, autenticação, CSRF, CRUD, conflitos, manutenção, isolamento por brinquedo, privacidade e persistência.')
