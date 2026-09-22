const $ = (id) => document.getElementById(id);
const statuses = { pending: 'Pendente', confirmed: 'Confirmada', cancelled: 'Cancelada' };
let csrf = '', setup = false, records = [], catalog = {}, month = new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDay = '', turnaround = 120;
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const format = (s) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
function applySession(session) {
  csrf=session.csrf;setup=session.setupRequired;
  $('loginTitle').textContent=setup?'Crie seu primeiro acesso':'Acesse sua agenda';
  $('loginHelp').textContent=setup?'No computador local, escolha seu usuário e uma senha de pelo menos 12 caracteres.':'Entre para gerenciar reservas e equipamentos.';
  $('loginButton').textContent=setup?'Criar administrador':'Entrar';
  $('loginForm').elements.password.minLength=setup?12:0;
  $('loginForm').elements.password.autocomplete=setup?'new-password':'current-password';
  if (!session.authenticated) {
    $('editor').close();$('bookingForm').reset();records=[];
    $('rows').replaceChildren();$('dayDetails').replaceChildren();$('calendar').replaceChildren();
    $('dashboard').hidden=true;$('logout').hidden=true;$('loginPanel').hidden=false;
  }
}
async function api(action, body) {
  const response = await fetch(`../api/admin.php?action=${action}`, { cache:'no-store', method:body?'POST':'GET', headers:body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{}, body:body?JSON.stringify(body):undefined });
  const result = await response.json();
  if (!response.ok) {
    if ((response.status===401 || response.status===403) && action!=='session') {
      const session=await api('session');applySession(session);
      if (!session.authenticated && action!=='login' && action!=='setup') {
        $('message').textContent='Sua sessão expirou. Entre novamente para continuar.';
        throw new Error($('message').textContent);
      }
    }
    throw new Error(result.error || 'Falha ao comunicar com o servidor.');
  }
  return result;
}
function el(tag,text,cls) { const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(cls)node.className=cls; return node; }
async function load() {
  const result=await api('list');records=result.bookings;catalog=result.toys;turnaround=result.turnaroundMinutes;$('turnaround').value=turnaround;
  if (!$('toyFilter').options.length) {
    for(const [id,name] of Object.entries(catalog)) { const option=el('option',name); option.value=id;$('toyFilter').append(option);
      const label=el('label');const input=el('input');input.type='checkbox';input.name='toys';input.value=id;label.append(input,document.createTextNode(name));$('toyChoices').append(label); }
  }
  $('loginPanel').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;render();
}
function edit(record=null,kind='rental') {
  const form=$('bookingForm');form.reset();$('editorError').textContent='';
  const initial={id:0,kind,status:kind==='maintenance'?'confirmed':'pending',fee:0};
  if(selectedDay) { initial.start=`${selectedDay}T09:00`;initial.end=`${selectedDay}T18:00`; }
  for(const [key,value] of Object.entries(record||initial)) if(form.elements.namedItem(key) && key!=='toys') form.elements.namedItem(key).value=value;
  form.querySelectorAll('[name=toys]').forEach(input=>{input.checked=record?record.toys.includes(input.value):input.value===$('toyFilter').value;});
  $('editorTitle').textContent=record?`Editar registro #${record.id}`:kind==='maintenance'?'Bloquear manutenção':'Nova reserva';updateSchedulePreview();$('editor').showModal();
}
function readyAt(r) { return new Date(new Date(r.end).getTime()+(r.kind==='rental'?turnaround:0)*60000); }
function updateSchedulePreview() {
  const fields=$('bookingForm').elements;
  const start=fields.namedItem('start').value,end=fields.namedItem('end').value;
  const kind=fields.namedItem('kind').value;
  const valid=start && end && new Date(end)>new Date(start);
  fields.namedItem('end').setCustomValidity(start && end && !valid?'A retirada deve ser posterior à instalação.':'');
  $('schedulePreview').textContent=fields.namedItem('status').value==='cancelled'
    ? 'Registro cancelado: não ocupa os brinquedos.'
    : valid ? `Brinquedos liberados em ${readyAt({end,kind}).toLocaleString('pt-BR')}.${kind==='rental'?` Inclui ${turnaround} minutos após a retirada para desmontagem e transporte.`:''}`
    : 'Informe instalação e retirada para consultar o horário de liberação.';
}
function dayRecords(day) { const next=new Date(`${day}T12:00`);next.setDate(next.getDate()+1);return records.filter(r=>r.status!=='cancelled'&&r.toys.includes($('toyFilter').value)&&r.start<`${dayKey(next)}T00:00`&&readyAt(r)>new Date(`${day}T00:00`)); }
function renderDay() {
  $('dayDetails').replaceChildren();if(!selectedDay)return;
  $('dayDetails').append(el('h3',`${catalog[$('toyFilter').value]} · ${new Date(`${selectedDay}T12:00`).toLocaleDateString('pt-BR')}`));
  const found=dayRecords(selectedDay);
  if(!found.length)$('dayDetails').append(el('p','Nenhum bloqueio neste dia.'));
  found.forEach(r=>{const button=el('button',`#${r.id} · ${r.name} · ${format(r.start)} → ${format(r.end)} · ${statuses[r.status]} · Liberado: ${readyAt(r).toLocaleString('pt-BR')}`);button.addEventListener('click',()=>edit(r));$('dayDetails').append(button);});
}
function render() {
  $('monthTitle').textContent=month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});$('calendar').replaceChildren();
  for(let i=0;i<month.getDay();i++)$('calendar').append(el('span'));
  const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  for(let i=1;i<=count;i++) { const key=dayKey(new Date(month.getFullYear(),month.getMonth(),i));const items=dayRecords(key);
    const state=items.some(r=>r.kind==='maintenance')?'maintenance':items.some(r=>r.status==='confirmed')?'confirmed':items.length?'pending':'available';
    const label={available:'Livre',pending:'Pendente',confirmed:'Reservado',maintenance:'Manutenção'}[state];
    const b=el('button',undefined,state);b.append(el('span',String(i)),el('small',label));b.setAttribute('aria-label',`${key}: ${label}`);b.setAttribute('aria-pressed',String(key===selectedDay));if(key===dayKey(new Date()))b.setAttribute('aria-current','date');b.addEventListener('click',()=>{selectedDay=key;render();});$('calendar').append(b);
  }
  $('rows').replaceChildren();const term=$('search').value.toLocaleLowerCase();
  const filtered=records.filter(r=>(!$('statusFilter').value||r.status===$('statusFilter').value)&&`${r.name} ${r.phone} ${r.address}`.toLocaleLowerCase().includes(term));
  $('empty').hidden=filtered.length>0;
  filtered.forEach(r=>{const row=el('tr');const name=el('td');name.append(el('strong',`#${r.id} · ${r.name}`),el('p',r.kind==='maintenance'?'Manutenção':r.phone));row.append(name,el('td',`${format(r.start)} → ${format(r.end)}`),el('td',r.toys.map(id=>catalog[id]).join(', ')));const state=el('td');state.append(el('span',statuses[r.status],`badge ${r.status}`));row.append(state,el('td',Number(r.total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})));const actions=el('td');
    const change=el('button','Editar');change.addEventListener('click',()=>edit(r));actions.append(change);
    if(r.status==='pending'){const confirm=el('button','Confirmar');confirm.addEventListener('click',()=>saveStatus(r,'confirmed'));actions.append(confirm);}
    if(r.status!=='cancelled'){const cancel=el('button','Cancelar');cancel.addEventListener('click',()=>{if(window.confirm(`Cancelar o registro #${r.id} e liberar os equipamentos?`))saveStatus(r,'cancelled');});actions.append(cancel);}
    row.append(actions);$('rows').append(row);
  });renderDay();
}
async function saveStatus(record,status) {try{await api('save',{...record,status});await load();$('message').textContent='Registro atualizado.';}catch(error){$('message').textContent=error.message;}}
$('loginForm').addEventListener('submit',async(event)=>{event.preventDefault();$('loginButton').disabled=true;try{const data=Object.fromEntries(new FormData(event.target));const result=await api(setup?'setup':'login',data);csrf=result.csrf;event.target.reset();setup=false;await load();$('message').textContent='';}catch(error){$('message').textContent=error.message;}finally{$('loginButton').disabled=false;}});
$('bookingForm').addEventListener('submit',async(event)=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const form=new FormData(event.target);const data=Object.fromEntries(form);data.toys=form.getAll('toys');await api('save',data);$('editor').close();await load();$('message').textContent='Registro salvo. Disponibilidade atualizada.';}catch(error){$('editorError').textContent=error.message;}finally{button.disabled=false;}});
$('closeEditor').addEventListener('click',()=>$('editor').close());$('newBooking').addEventListener('click',()=>edit());$('newMaintenance').addEventListener('click',()=>edit(null,'maintenance'));
$('bookingForm').addEventListener('input',updateSchedulePreview);
$('logout').addEventListener('click',async()=>{try{await api('logout',{});location.reload();}catch(e){$('message').textContent=e.message;}});
$('prevMonth').addEventListener('click',()=>{month.setMonth(month.getMonth()-1);render();});$('nextMonth').addEventListener('click',()=>{month.setMonth(month.getMonth()+1);render();});
for(const id of ['toyFilter','statusFilter'])$(id).addEventListener('change',render);$('search').addEventListener('input',render);
(async()=>{try{const session=await api('session');applySession(session);if(session.authenticated)await load();}catch(error){$('message').textContent='Não foi possível abrir o painel. Acesse pelo servidor PHP (MAMP).';}})();

$('settingsForm').addEventListener('submit',async(event)=>{
  event.preventDefault(); const button=event.submitter; button.disabled=true;
  try { await api('settings',{turnaroundMinutes:Number($('turnaround').value)});await load();$('message').textContent='Margem atualizada.'; }
  catch(error){$('message').textContent=error.message;} finally{button.disabled=false;}
});
