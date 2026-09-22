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
    document: { getElementById: element },
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
