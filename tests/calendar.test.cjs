const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dateKey, monthStart, monthDays, availability, canSelect } = require('../js/calendar.js');
test('datas locais, anos bissextos e transição de ano', () => {
  assert.equal(dateKey(new Date(2026, 8, 22, 23, 59)), '2026-09-22');
  assert.equal(dateKey(monthStart(new Date(2026, 8, 22))), '2026-09-01');
  assert.equal(monthDays(new Date(2028, 1, 1)).length, 29);
  assert.equal(monthDays(new Date(2026, 1, 1)).length, 28);
  assert.equal(monthDays(new Date(2026, 12, 1))[0], '2027-01-01');
});
test('disponibilidade exige informação de todos os brinquedos selecionados', () => {
  const data = { '2026-09-22': { 'cama-p': 'available', 'cama-m': 'unavailable' } };
  assert.equal(availability(data, '2026-09-22', ['cama-p']), 'available');
  assert.equal(availability(data, '2026-09-22', ['cama-p', 'cama-m']), 'unavailable');
  assert.equal(availability(data, '2026-09-22', ['cama-p', 'castelinho']), 'unknown');
  assert.equal(availability(data, '2026-09-23', ['cama-p']), 'unknown');
  assert.equal(availability(data, '2026-09-22', []), 'unknown');
  assert.equal(availability(null, '2026-09-22', ['cama-p']), 'unknown');
});

test('bloqueia dias passados e ocupados, permite hoje e datas a confirmar', () => {
  assert.equal(canSelect('2026-09-21', '2026-09-22', 'available'), false);
  assert.equal(canSelect('2026-09-22', '2026-09-22', 'unknown'), true);
  assert.equal(canSelect('2026-09-23', '2026-09-22', 'unavailable'), false);
  assert.equal(canSelect('2027-01-01', '2026-12-31', 'available'), true);
});

const { toyAvailability, dayAvailability, applyToyAvailability } = require('../js/calendar.js');
test('cama G ocupada não bloqueia os outros brinquedos nem o dia inteiro', () => {
  const data = { '2026-10-12': { 'cama-g': 'unavailable', 'cama-p': 'available', 'castelinho': 'available' } };
  const g = { checked: true, disabled: false };
  const p = { checked: true, disabled: false };
  assert.equal(applyToyAvailability(g, toyAvailability(data, '2026-10-12', 'cama-g')), true);
  assert.deepEqual(g, { checked: false, disabled: true });
  assert.equal(applyToyAvailability(p, toyAvailability(data, '2026-10-12', 'cama-p')), false);
  assert.deepEqual(p, { checked: true, disabled: false });
  assert.equal(dayAvailability(data, '2026-10-12', ['cama-g', 'cama-p', 'castelinho']), 'partial');
  assert.equal(toyAvailability(data, '2026-10-12', 'piscina'), 'unknown');
});
test('trocar para uma data livre libera o equipamento sem selecioná-lo automaticamente', () => {
  const toy = { checked: false, disabled: true };
  applyToyAvailability(toy, 'available');
  assert.deepEqual(toy, { checked: false, disabled: false });
});
test('ocupação total exige dados de todos os equipamentos', () => {
  const data = { '2026-10-12': { 'cama-g': 'unavailable', 'cama-p': 'unavailable' } };
  assert.equal(dayAvailability(data, '2026-10-12', ['cama-g', 'cama-p']), 'unavailable');
  assert.equal(dayAvailability(data, '2026-10-12', ['cama-g', 'cama-p', 'piscina']), 'unknown');
  assert.equal(dayAvailability({}, '2026-10-12', ['cama-g', 'cama-p']), 'unknown');
});

const { calendarState } = require('../js/calendar.js');
test('cores mudam conforme a seleção, sem incluir equipamentos não selecionados', () => {
  const data = { '2026-10-12': { 'cama-p': 'available', 'cama-m': 'available', 'cama-g': 'unavailable', 'piscina': 'unavailable' } };
  assert.equal(calendarState(data, '2026-10-12', ['cama-p', 'cama-m'], '2026-10-01'), 'available');
  assert.equal(calendarState(data, '2026-10-12', ['cama-p', 'cama-g'], '2026-10-01'), 'partial');
  assert.equal(calendarState(data, '2026-10-12', ['cama-g', 'piscina'], '2026-10-01'), 'unavailable');
  assert.equal(calendarState(data, '2026-10-12', ['cama-p'], '2026-10-13'), 'blocked');
  assert.equal(calendarState(data, '2026-10-12', ['cama-p'], '2026-10-01', ['2026-10-12']), 'blocked');
});
test('sem seleção ou com dados incompletos nunca indica disponibilidade total', () => {
  const data = { '2026-10-12': { 'cama-p': 'available' } };
  assert.equal(calendarState(data, '2026-10-12', [], '2026-10-01'), 'unknown');
  assert.equal(calendarState(data, '2026-10-12', ['cama-p', 'cama-g'], '2026-10-01'), 'unknown');
});

const { toyIndicators } = require('../js/calendar.js');
test('círculos mantêm a ordem da seleção e a situação individual', () => {
  const data = { '2026-10-12': { 'cama-p': 'available', 'cama-g': 'unavailable' } };
  assert.deepEqual(toyIndicators(data, '2026-10-12', ['cama-g', 'cama-p', 'piscina']), [
    { id: 'cama-g', state: 'unavailable' },
    { id: 'cama-p', state: 'available' },
    { id: 'piscina', state: 'unknown' }
  ]);
  assert.deepEqual(toyIndicators(data, '2026-10-12', []), []);
  assert.deepEqual(toyIndicators(data, '2026-10-13', ['cama-g']), [{ id: 'cama-g', state: 'unknown' }]);
});
test('dias bloqueados usam círculos neutros mesmo com equipamentos livres', () => {
  const data = { '2026-10-12': { 'cama-p': 'available', 'cama-g': 'unavailable' } };
  assert.deepEqual(toyIndicators(data, '2026-10-12', ['cama-p', 'cama-g'], true), [
    { id: 'cama-p', state: 'blocked' }, { id: 'cama-g', state: 'blocked' }
  ]);
});

const { periodDays, periodAvailability, nextAvailableDates } = require('../js/calendar.js');
test('período inclui dias intermediários e exclui retirada exatamente à meia-noite', () => {
  assert.deepEqual(periodDays('2026-10-30T10:00', '2026-11-02T00:00'), ['2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(periodDays('2026-10-12T10:00', '2026-10-12T10:00'), []);
  assert.deepEqual(periodDays('', ''), []);
  const data = { '2026-10-30': { p: 'available' }, '2026-10-31': { p: 'unavailable' }, '2026-11-01': { p: 'available' } };
  assert.equal(periodAvailability(data, '2026-10-30T10:00', '2026-11-01T18:00', ['p']), 'unavailable');
});
test('sugere as três próximas datas simultaneamente livres por todo o período', () => {
  const data = {};
  for (let d = 12; d <= 25; d++) data[`2026-10-${d}`] = { p: 'available', g: 'available' };
  data['2026-10-12'].g = 'unavailable';
  data['2026-10-14'].g = 'unavailable';
  const matches = nextAvailableDates(data, '2026-10-12T09:00', '2026-10-13T18:00', ['p', 'g'], ['2026-10-18'], new Date('2026-10-01T00:00'));
  assert.deepEqual(matches, [
    { start: '2026-10-15T09:00', end: '2026-10-16T18:00' },
    { start: '2026-10-16T09:00', end: '2026-10-17T18:00' },
    { start: '2026-10-19T09:00', end: '2026-10-20T18:00' }
  ]);
});
test('busca atravessa o ano e conserva horários e duração', () => {
  const data = {};
  for (let d = 1; d <= 5; d++) data[`2027-01-0${d}`] = { g: 'available' };
  const matches = nextAvailableDates(data, '2026-12-31T14:00', '2027-01-01T16:30', ['g'], [], new Date('2026-12-01T00:00'));
  assert.equal(matches.length, 3);
  assert.deepEqual(matches[0], { start: '2027-01-01T14:00', end: '2027-01-02T16:30' });
});
test('não sugere dados incompletos, datas passadas ou períodos inválidos', () => {
  const data = { '2026-10-13': { p: 'available' } };
  assert.deepEqual(nextAvailableDates(data, '2026-10-12T09:00', '2026-10-12T18:00', ['p', 'g'], [], new Date('2026-10-01')), []);
  assert.deepEqual(nextAvailableDates(data, '2026-10-12T09:00', '2026-10-12T18:00', ['p'], [], new Date('2026-10-14')), []);
  assert.deepEqual(nextAvailableDates(data, '2026-10-12T09:00', '', ['p']), []);
  assert.deepEqual(nextAvailableDates(data, '2026-10-12T09:00', '2026-10-12T18:00', []), []);
});

const { availableToyIds, moveRentalDate } = require('../js/calendar.js');
test('continuar com disponíveis exclui alugados e dados não confirmados no período', () => {
  const data = {
    '2026-10-12': { p: 'available', g: 'available', piscina: 'available' },
    '2026-10-13': { p: 'available', g: 'unavailable' }
  };
  assert.deepEqual(availableToyIds(data, '2026-10-12T09:00', '2026-10-13T18:00', ['p', 'g', 'piscina']), ['p']);
  assert.deepEqual(availableToyIds(data, '2026-10-12T09:00', '2026-10-13T18:00', ['p'], ['2026-10-13']), []);
});
test('trocar data preenche instalação e conserva horário e duração na virada de mês', () => {
  assert.deepEqual(moveRentalDate('2026-10-31', '2026-10-12T09:30', '2026-10-13T18:00'), {
    start: '2026-10-31T09:30', end: '2026-11-01T18:00'
  });
  assert.deepEqual(moveRentalDate('2026-10-31', '', ''), { start: '2026-10-31T09:00', end: '' });
});

test('consulta horários exatos com margem antes e depois, isolada por brinquedo', () => {
  // O fim recebido da API já inclui a margem da reserva existente.
  const data = { __schedule: { months: ['2026-10'], turnaroundMinutes: 120,
    busy: [{ toy: 'g', start: '2026-10-12T10:00', end: '2026-10-12T20:00' }] } };
  const check = (start, end, toys = ['g']) => periodAvailability(data, `2026-10-12T${start}`, `2026-10-12T${end}`, toys);
  assert.equal(check('09:00', '12:00'), 'unavailable');
  assert.equal(check('18:00', '19:00'), 'unavailable');
  assert.equal(check('19:59', '21:00'), 'unavailable');
  assert.equal(check('20:00', '21:00'), 'available');
  assert.equal(check('07:00', '08:00'), 'available');
  assert.equal(check('07:00', '08:01'), 'unavailable', 'transporte da nova reserva colide com a instalação existente');
  assert.equal(check('10:00', '18:00', ['p']), 'available');
  assert.equal(check('10:00', '18:00', ['p', 'g']), 'unavailable');
  data.__schedule.turnaroundMinutes = 0;
  assert.equal(check('08:00', '10:00'), 'available');
});

test('margem atravessa mês e exige cobertura completa, inclusive de bloqueios', () => {
  const data = { __schedule: { months: ['2026-10'], turnaroundMinutes: 120, busy: [] } };
  const check = (blocked = []) => periodAvailability(data, '2026-10-31T20:00', '2026-10-31T23:00', ['g'], blocked);
  assert.equal(check(), 'unknown');
  data.__schedule.months.push('2026-11');
  assert.equal(check(), 'available');
  assert.equal(check(['2026-11-01']), 'unavailable');
  data.__schedule.busy.push({toy: 'g', start: '2026-11-01T00:30', end: '2026-11-01T12:00'});
  assert.equal(check(), 'unavailable');
  assert.equal(periodAvailability(null, '2026-10-31T20:00', '2026-10-31T23:00', ['g']), 'unknown');
});

test('sugestões respeitam os horários e a margem de transporte', () => {
  const data = { __schedule: { months: ['2026-10'], turnaroundMinutes: 120,
    busy: [{ toy: 'g', start: '2026-10-13T19:00', end: '2026-10-13T22:00' }] } };
  const matches = nextAvailableDates(data, '2026-10-12T09:00', '2026-10-12T18:00', ['g'], [], new Date('2026-10-01T00:00'));
  assert.deepEqual(matches.map(item => item.start), ['2026-10-14T09:00', '2026-10-15T09:00', '2026-10-16T09:00']);
});
