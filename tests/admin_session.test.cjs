const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('sessão expirada remove dados privados e permite entrar com o token renovado', async () => {
  const elements = {};
  const element = (id) => elements[id] ||= {
    hidden: false, textContent: '', elements: { password: {} },
    addEventListener() {}, close() { this.closed = true; },
    reset() { this.resetCalled = true; },
    replaceChildren() { this.cleared = true; }
  };
  let expired = false;
  const requests = [];
  const context = vm.createContext({
    document: { getElementById: element, addEventListener() {} },
    window: { addEventListener() {} }, setInterval() {},
    fetch: async (url, options) => {
      const action = url.split('=')[1];
      requests.push({ action, options });
      if (action === 'session') return { ok: true, json: async () => ({ authenticated: false, setupRequired: !expired, csrf: expired ? 'fresh' : 'initial' }) };
      if (action === 'save') return { ok: false, status: 403, json: async () => ({ error: 'Sessão inválida.' }) };
      assert.equal(action, 'login');
      assert.equal(options.headers['X-CSRF-Token'], 'fresh');
      return { ok: true, json: async () => ({ ok: true, csrf: 'logged-in' }) };
    }
  });
  vm.runInContext(fs.readFileSync('admin/admin.js', 'utf8'), context);
  await new Promise(setImmediate);
  assert.equal(element('loginButton').textContent, 'Criar administrador');
  expired = true;
  vm.runInContext("records=[{name:'Cliente privado'}]", context);
  await assert.rejects(vm.runInContext("api('save',{id:1})", context), /sessão expirou/);
  assert.equal(element('dashboard').hidden, true);
  assert.equal(element('logout').hidden, true);
  assert.equal(element('loginPanel').hidden, false);
  assert.equal(element('rows').cleared, true);
  assert.equal(element('bookingForm').resetCalled, true);
  assert.equal(vm.runInContext('records.length', context), 0);
  assert.equal(element('loginButton').textContent, 'Entrar');
  assert.equal(element('loginForm').elements.password.autocomplete, 'current-password');
  await vm.runInContext("api('login',{username:'admin',password:'test'})", context);
  assert.equal(requests.filter(r => r.action === 'save').length, 1, 'não repetir gravação automaticamente');
});

test('sincroniza outro dispositivo sem substituir formulário e ignora respostas antigas', async () => {
  const elements = {};
  const element = id => elements[id] ||= {
    hidden: false, value: '', textContent: '', options: [1], elements: { password: {} },
    addEventListener() {}, close() {}, reset() {}, replaceChildren() {}
  };
  const events = {};
  let tick;
  let fail = false;
  let bookings = [{ id: 1, status: 'confirmed' }];
  const pending = [];
  let delayed = false;
  const context = vm.createContext({
    document: { hidden: false, getElementById: element, addEventListener(name, fn) { events[name] = fn; } },
    window: { addEventListener(name, fn) { events[name] = fn; } },
    setInterval(fn, ms) { assert.equal(ms, 30000); tick = fn; },
    fetch: async url => {
      if (url.endsWith('session')) return { ok: true, json: async () => ({ authenticated: false, csrf: 'token' }) };
      if (fail) throw new Error('offline');
      if (delayed) return new Promise(resolve => pending.push(resolve));
      return { ok: true, json: async () => ({ bookings, toys: {}, turnaroundMinutes: 120 }) };
    }
  });
  vm.runInContext(fs.readFileSync('admin/admin.js', 'utf8'), context);
  await new Promise(setImmediate);
  vm.runInContext('render=()=>{}', context);
  element('dashboard').hidden = false;
  element('turnaround').value = '45';
  element('bookingForm').value = 'rascunho';
  await tick();
  assert.equal(vm.runInContext('records[0].status', context), 'confirmed');
  assert.equal(element('turnaround').value, '45');
  assert.equal(element('bookingForm').value, 'rascunho');
  bookings = [{ id: 1, status: 'cancelled' }];
  await events.online();
  assert.equal(vm.runInContext('records[0].status', context), 'cancelled');
  fail = true;
  await tick();
  assert.match(element('message').textContent, /sincronizar/);
  fail = false;
  await tick();
  assert.equal(element('message').textContent, '');
  context.document.hidden = true;
  bookings = [];
  await tick();
  assert.equal(vm.runInContext('records.length', context), 1);
  context.document.hidden = false;
  events.visibilitychange();
  await new Promise(setImmediate);
  assert.equal(vm.runInContext('records.length', context), 0);
  delayed = true;
  const old = vm.runInContext('load(true)', context);
  const latest = vm.runInContext('load()', context);
  const response = status => ({ ok: true, json: async () => ({ bookings: [{ status }], toys: {}, turnaroundMinutes: 120 }) });
  pending[1](response('cancelled'));
  await latest;
  pending[0](response('confirmed'));
  await old;
  assert.equal(vm.runInContext('records[0].status', context), 'cancelled');
});
