const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('orçamento e WhatsApp usam somente os equipamentos mantidos', () => {
  const events = {};
  const field = (value = '') => ({ value, textContent: '', addEventListener() {}, focus() {}, setCustomValidity() {} });
  const p = { ...field(), checked: true, disabled: false, dataset: { preco: '130' }, closest: () => ({ querySelector: () => ({ textContent: 'Cama P — R$ 130,00' }) }) };
  const g = { ...field(), checked: true, disabled: false, dataset: { preco: '180' }, closest: () => ({ querySelector: () => ({ textContent: 'Cama G — R$ 180,00' }) }) };
  const elements = {
    reservaForm: { addEventListener: (event, cb) => { events[event] = cb; }, reportValidity: () => true },
    rRegiao: { ...field('Colombo'), selectedOptions: [{ dataset: { taxa: '15' } }] },
    resumoBrinquedo: field(), resumoTaxa: field(), resumoTotal: field(),
    rNome: field('Ana & João'), rTelefone: field('(41) 99999-9999'), rEndereco: field('Rua teste'), rInstalacao: field('2026-10-12T09:00'), rDesinstalacao: field('2026-10-12T18:00'), brinquedosAjuda: field()
  };
  const urls = [];
  const context = vm.createContext({ document: { getElementById: (id) => elements[id] || null, querySelectorAll: (selector) => selector.startsWith('input') ? [p, g] : [] }, window: { open: (url) => urls.push(url) } });
  vm.runInContext(fs.readFileSync('js/script.js', 'utf8'), context);
  assert.match(elements.resumoTotal.textContent, /325,00/);
  g.checked = false; g.disabled = true;
  vm.runInContext('atualizarResumo()', context);
  assert.match(elements.resumoTotal.textContent, /145,00/);
  events.submit({ preventDefault() {} });
  assert.equal(urls.length, 1);
  const message = new URL(urls[0]).searchParams.get('text');
  assert.match(message, /Cama P/); assert.doesNotMatch(message, /Cama G/); assert.match(message, /145,00/);
  assert.equal(new URL(urls[0]).pathname, '/5541995960567');
  for (const text of ['Nome: Ana & João', 'Telefone / WhatsApp: (41) 99999-9999',
    'Região: Colombo', 'Endereço: Rua teste', 'Instalação: 12/10/2026 às 09:00',
    'Retirada: 12/10/2026 às 18:00', 'A reserva só será confirmada após a aprovação da empresa.']) {
    assert.ok(message.includes(text), text);
  }
  assert.match(message, /Subtotal dos brinquedos: R\$\s*130,00/);
  assert.match(message, /Taxa de entrega: R\$\s*15,00/);
  elements.reservaForm.reportValidity = () => false;
  events.submit({ preventDefault() {} });
  assert.equal(urls.length, 1, 'não abre WhatsApp com formulário inválido');
  elements.reservaForm.reportValidity = () => true;
  p.checked = false;
  events.submit({ preventDefault() {} });
  assert.equal(urls.length, 1, 'não envia um pedido sem equipamentos');
});
