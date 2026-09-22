// Datas civis locais: evita que a conversão para UTC mude o dia da festa.
const ReservaCalendar = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const monthDays = (month) => {
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => dateKey(new Date(month.getFullYear(), month.getMonth(), i + 1, 12)));
  };
  const availability = (data, day, toys) => {
    if (!toys.length) return 'unknown';
    const states = toys.map((toy) => data?.[day]?.[toy]);
    if (states.includes('unavailable')) return 'unavailable';
    return states.every((state) => state === 'available') ? 'available' : 'unknown';
  };
  const toyAvailability = (data, day, toy) => availability(data, day, [toy]);
  // As cores refletem somente os brinquedos selecionados pelo visitante.
  const dayAvailability = (data, day, toys) => {
    const states = toys.map((toy) => toyAvailability(data, day, toy));
    if (states.length && states.every((state) => state === 'available')) return 'available';
    if (states.includes('available') && states.includes('unavailable')) return 'partial';
    return states.length && states.every((state) => state === 'unavailable') ? 'unavailable' : 'unknown';
  };
  const calendarState = (data, day, toys, today, blockedDates = []) =>
    day < today || blockedDates.includes(day) ? 'blocked' : dayAvailability(data, day, toys);
  const toyIndicators = (data, day, toyIds, blocked = false) => toyIds.map((id) => ({
    id, state: blocked ? 'blocked' : toyAvailability(data, day, id)
  }));
  const applyToyAvailability = (input, state) => {
    input.disabled = state === 'unavailable';
    const removed = input.disabled && input.checked;
    if (input.disabled) input.checked = false;
    return removed;
  };
  const localDateTime = (date) => `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const periodDays = (start, end) => {
    const from = new Date(start), to = new Date(end);
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || to <= from || to - from > 366 * 86400000) return [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const result = [];
    // Intervalo [instalação, retirada): retirada à meia-noite não ocupa o dia seguinte.
    while (cursor < to) { result.push(dateKey(cursor)); cursor.setDate(cursor.getDate() + 1); }
    return result;
  };
  const periodAvailability = (data, start, end, toys, blockedDates = []) => {
    const dates = periodDays(start, end);
    if (!dates.length || !toys.length) return 'unknown';
    if (data?.__schedule) {
      const schedule = data.__schedule;
      const expandedEnd = new Date(new Date(end).getTime() + schedule.turnaroundMinutes * 60000);
      const coverage = periodDays(start, localDateTime(expandedEnd));
      if (coverage.some((day) => blockedDates.includes(day))) return 'unavailable';
      if (schedule.busy.some((busy) => toys.includes(busy.toy) && new Date(start) < new Date(busy.end) && new Date(busy.start) < expandedEnd)) return 'unavailable';
      return coverage.length && coverage.every((day) => schedule.months.includes(day.slice(0, 7))) ? 'available' : 'unknown';
    }
    const states = dates.map((day) => blockedDates.includes(day) ? 'unavailable' : availability(data, day, toys));
    if (states.includes('unavailable')) return 'unavailable';
    return states.every((state) => state === 'available') ? 'available' : 'unknown';
  };
  const nextAvailableDates = (data, start, end, toys, blockedDates = [], now = new Date(), horizon = 90) => {
    if (!periodDays(start, end).length || !toys.length) return [];
    const original = new Date(start), duration = new Date(end) - original;
    const result = [];
    for (let offset = 1; offset <= horizon && result.length < 3; offset++) {
      const from = new Date(original);
      from.setDate(from.getDate() + offset);
      if (from < now) continue;
      const to = new Date(+from + duration);
      const candidate = { start: localDateTime(from), end: localDateTime(to) };
      if (periodAvailability(data, candidate.start, candidate.end, toys, blockedDates) === 'available') result.push(candidate);
    }
    return result;
  };
  const availableToyIds = (data, start, end, ids, blockedDates = []) => ids.filter((id) =>
    periodDays(start, end).length
      ? periodAvailability(data, start, end, [id], blockedDates) === 'available'
      : !blockedDates.includes(start.slice(0, 10)) && toyAvailability(data, start.slice(0, 10), id) === 'available'
  );
  const moveRentalDate = (day, start, end, now = new Date()) => {
    const oldStart = new Date(start), oldEnd = new Date(end);
    const time = start.slice(11) || (day === dateKey(now) ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : '09:00');
    const nextStart = `${day}T${time}`;
    const duration = oldEnd - oldStart;
    return { start: nextStart, end: duration > 0 ? localDateTime(new Date(+new Date(nextStart) + duration)) : '' };
  };
  const canSelect = (day, today, state) => day >= today && state !== 'unavailable';
  return { dateKey, monthStart, monthDays, availability, canSelect, toyAvailability, dayAvailability, applyToyAvailability, calendarState, toyIndicators, periodDays, periodAvailability, nextAvailableDates, availableToyIds, moveRentalDate };
})();
if (typeof module !== 'undefined') module.exports = ReservaCalendar;

if (typeof document !== 'undefined') (() => {
  const root = document.getElementById('calendarioReserva');
  if (!root) return;
  const { dateKey, monthStart, monthDays, availability, canSelect, toyAvailability, dayAvailability, applyToyAvailability, calendarState, toyIndicators, periodDays, periodAvailability, nextAvailableDates, availableToyIds, moveRentalDate } = ReservaCalendar;
  const installation = document.getElementById('rInstalacao');
  const removal = document.getElementById('rDesinstalacao');
  const days = document.getElementById('calDias');
  const title = document.getElementById('calMes');
  const status = document.getElementById('calStatus');
  const previous = document.getElementById('calAnterior');
  const details = document.getElementById('calDetalhes');
  const dotLegend = document.getElementById('calIndicadoresLegenda');
  const toys = [...document.querySelectorAll('input[name="brinquedos"]')];
  const wanted = new Set(toys.filter((toy) => toy.checked).map((toy) => toy.value));
  const selectedToys = () => [...wanted];
  const suggestions = document.getElementById('calSugestoes');
  let month = monthStart(new Date());
  let selected = installation.value.slice(0, 10);
  let data = {};
  let blockedDates = [];
  let loading = false;
  let failed = false;
  let request = null;
  // Configure apenas com uma API real. Ausência de dados nunca significa livre.
  const endpoint = root.dataset.availabilityUrl;
  const fullDate = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'full' });
  const labels = { blocked: 'data bloqueada', partial: 'alguns brinquedos disponíveis', available: 'disponível', unavailable: 'indisponível', unknown: 'disponibilidade a confirmar' };

  const toyNames = new Map(toys.map((toy) => [toy.value,
    toy.closest('label').querySelector('.brinquedo-nome').textContent.split(' — ')[0].trim()
  ]));
  const detailLabels = { available: 'Disponível', unavailable: 'Indisponível', unknown: 'A confirmar', blocked: 'Data bloqueada' };
  const toyStatuses = new Map();
  toys.forEach((toy) => {
    const label = toy.closest('label');
    const badge = document.createElement('small');
    badge.className = 'brinquedo-disponibilidade';
    badge.id = `disponibilidade-${toy.value}`;
    toy.setAttribute('aria-describedby', badge.id);
    label.append(badge);
    toyStatuses.set(toy, badge);
  });
  const notice = document.createElement('p');
  notice.className = 'brinquedos-disponibilidade-aviso';
  notice.setAttribute('role', 'status');
  document.querySelector('.campo--brinquedos').append(notice);

  function updateToys() {
    const removed = [];
    toys.forEach((toy) => {
      const state = selected ? (periodDays(installation.value, removal.value).length
        ? periodAvailability(data, installation.value, removal.value, [toy.value], blockedDates)
        : toyAvailability(data, selected, toy.value)) : 'unknown';
      if (wanted.has(toy.value) && state !== 'unavailable') toy.checked = true;
      if (applyToyAvailability(toy, state)) removed.push(toy.closest('label').querySelector('.brinquedo-nome').textContent);
      toy.closest('label').dataset.availability = state;
      toyStatuses.get(toy).textContent = !selected ? 'Escolha uma data' : loading ? 'Consultando…' : labels[state];
    });
    if (removed.length) notice.textContent = `Removido da seleção por indisponibilidade: ${removed.join(', ')}. Os demais brinquedos continuam disponíveis para escolha.`;
    atualizarResumo();
  }

  function validateDates() {
    const now = new Date();
    installation.min = `${dateKey(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const after = installation.value ? new Date(new Date(installation.value).getTime() + 60000) : now;
    removal.min = `${dateKey(after)}T${String(after.getHours()).padStart(2, '0')}:${String(after.getMinutes()).padStart(2, '0')}`;
    installation.setCustomValidity(blockedDates.includes(selected)
      ? 'Esta data está bloqueada. Escolha outro dia.'
      : selected && toys.every((toy) => toy.disabled)
      ? 'Todos os brinquedos estão indisponíveis neste dia. Escolha outra data.'
      : selected && !periodDays(installation.value, removal.value).length && availability(data, selected, selectedToys()) === 'unavailable'
      ? 'Um dos brinquedos selecionados está indisponível neste dia. Escolha outra data ou outro brinquedo.' : '');
    if (periodAvailability(data, installation.value, removal.value, selectedToys(), blockedDates) === 'unavailable') {
      installation.setCustomValidity('Há brinquedos indisponíveis no período. Escolha uma sugestão ou ajuste os brinquedos.');
    }
  }

  function renderDetails() {
    details.hidden = !selected;
    if (!selected) return;
    const heading = document.createElement('h4');
    heading.textContent = `Brinquedos em ${new Date(`${selected}T12:00:00`).toLocaleDateString('pt-BR')}`;
    const list = document.createElement('ul');
    // Mantém os alugados visíveis mesmo após sua remoção automática do orçamento.
    const blocked = selected < dateKey(new Date()) || blockedDates.includes(selected);
    const periodValid = periodDays(installation.value, removal.value).length;
    if (periodValid) heading.textContent = 'Disponibilidade no período escolhido';
    const detailStates = toys.map((toy) => ({ id: toy.value, state: blocked ? 'blocked' : periodValid
      ? periodAvailability(data, installation.value, removal.value, [toy.value], blockedDates)
      : toyAvailability(data, selected, toy.value) }));
    for (const { id, state } of detailStates) {
      const item = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = `calendario__ponto calendario__ponto--${state}`;
      dot.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.textContent = toyNames.get(id);
      const label = document.createElement('strong');
      label.className = `calendario__situacao calendario__situacao--${state}`;
      label.textContent = loading ? 'Consultando…' : detailLabels[state];
      item.append(dot, name, label);
      list.append(item);
    }
    details.replaceChildren(heading, list);
  }

  function renderSuggestions() {
    const conflict = periodAvailability(data, installation.value, removal.value, selectedToys(), blockedDates) === 'unavailable'
      || (selected && !periodDays(installation.value, removal.value).length && availability(data, selected, selectedToys()) === 'unavailable');
    suggestions.hidden = !conflict;
    suggestions.replaceChildren();
    if (!conflict) return;
    const heading = document.createElement('h4');
    heading.textContent = 'Outras datas para sua festa';
    const explanation = document.createElement('p');
    explanation.textContent = `Buscando todos juntos: ${selectedToys().map((id) => toyNames.get(id)).join(', ')}. Mantemos a duração da locação.`;
    suggestions.append(heading, explanation);
    const matches = loading ? [] : nextAvailableDates(data, installation.value, removal.value, selectedToys(), blockedDates);
    const list = document.createElement('div');
    list.className = 'calendario__sugestoes-lista';
    if (matches.length) {
      matches.forEach((match) => {
        const button = document.createElement('button');
        button.type = 'button';
        const format = (value) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        button.textContent = `${format(match.start)} → ${format(match.end)}`;
        button.addEventListener('click', () => {
          // Verifica novamente os dados atuais antes de aplicar a sugestão.
          if (periodAvailability(data, match.start, match.end, selectedToys(), blockedDates) !== 'available') return;
          installation.value = match.start;
          removal.value = match.end;
          selected = match.start.slice(0, 10);
          month = monthStart(new Date(match.start));
          notice.textContent = '';
          render();
          installation.focus();
        });
        list.append(button);
      });
    }
    const message = document.createElement('p');
    message.textContent = loading ? 'Consultando as próximas datas…'
      : !periodDays(installation.value, removal.value).length ? 'Informe um período válido de instalação e retirada para buscar alternativas (até 366 dias).'
      : matches.length === 3 ? 'Confira os horários antes de enviar seu pedido.'
      : `Encontramos ${matches.length} alternativa(s) confirmada(s) nos próximos 90 dias. Datas sem informação não são sugeridas.`;
    const keepAvailable = document.createElement('button');
    keepAvailable.type = 'button';
    keepAvailable.className = 'calendario__manter-disponiveis';
    const availableIds = availableToyIds(data, installation.value, removal.value, selectedToys(), blockedDates);
    keepAvailable.textContent = `Continuar com os disponíveis (${availableIds.length})`;
    keepAvailable.disabled = loading || !availableIds.length;
    keepAvailable.addEventListener('click', () => {
      const confirmed = availableToyIds(data, installation.value, removal.value, selectedToys(), blockedDates);
      if (!confirmed.length) return;
      wanted.clear();
      confirmed.forEach((id) => wanted.add(id));
      toys.forEach((toy) => { toy.checked = wanted.has(toy.value); });
      render();
      notice.textContent = 'Seleção ajustada aos brinquedos disponíveis. Orçamento atualizado automaticamente.';
      document.getElementById('resumoTotal').focus();
    });
    const chooseDate = document.createElement('button');
    chooseDate.type = 'button';
    chooseDate.className = 'calendario__outra-data';
    chooseDate.textContent = 'Escolher outra data';
    chooseDate.addEventListener('click', () => {
      root.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      (days.querySelector('button[aria-pressed="true"]:not(:disabled)') || days.querySelector('button:not(:disabled)'))?.focus();
    });
    suggestions.append(list, message, chooseDate, keepAvailable);
    if (!availableIds.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nenhum dos brinquedos escolhidos está confirmado como disponível neste período. Escolha outra data ou ajuste os equipamentos.';
      suggestions.append(empty);
    }
  }

  function render() {
    updateToys();
    const today = dateKey(new Date());
    const indicatorToys = selectedToys();
    dotLegend.textContent = indicatorToys.length
      ? `Círculos na ordem: ${indicatorToys.map((id) => toyNames.get(id)).join(' · ')}.`
      : 'Selecione brinquedos para ver os indicadores de cada dia.';
    title.textContent = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    previous.disabled = dateKey(month) <= dateKey(monthStart(new Date()));
    days.replaceChildren();
    for (let i = 0; i < month.getDay(); i++) {
      const blank = document.createElement('span');
      blank.setAttribute('aria-hidden', 'true');
      days.append(blank);
    }
    for (const day of monthDays(month)) {
      let dayData = data;
      if (data.__schedule && periodDays(installation.value, removal.value).length) {
        const candidate = moveRentalDate(day, installation.value, removal.value);
        dayData = { [day]: Object.fromEntries(toys.map((toy) => [toy.value,
          periodAvailability(data, candidate.start, candidate.end, [toy.value], blockedDates)])) };
      }
      const state = calendarState(dayData, day, selectedToys(), today, blockedDates);
      const button = document.createElement('button');
      button.type = 'button';
      const number = document.createElement('span');
      number.textContent = String(Number(day.slice(-2)));
      const dots = document.createElement('span');
      dots.className = 'calendario__pontos';
      dots.setAttribute('aria-hidden', 'true');
      const indicators = toyIndicators(dayData, day, indicatorToys, state === 'blocked');
      for (const { id, state: toyState } of indicators) {
        const dot = document.createElement('span');
        dot.className = `calendario__ponto calendario__ponto--${toyState}`;
        dot.title = `${toyNames.get(id)}: ${detailLabels[toyState]}`;
        dots.append(dot);
      }
      button.append(number, dots);
      button.dataset.date = day;
      button.className = `calendario__dia calendario__dia--${state}`;
      button.disabled = state === 'blocked';
      button.setAttribute('aria-label', `${fullDate(day)}: ${day < today ? 'data passada' : labels[state]}. ${indicators.map(({ id, state: toyState }) => `${toyNames.get(id)}: ${detailLabels[toyState]}`).join('; ')}`);
      button.setAttribute('aria-pressed', String(day === selected));
      if (day === today) button.setAttribute('aria-current', 'date');
      button.addEventListener('click', () => select(day));
      days.append(button);
    }
    if (loading) status.textContent = 'Consultando disponibilidade…';
    else if (failed) status.textContent = 'Não foi possível atualizar a agenda. Confirme a disponibilidade pelo WhatsApp.';
    else if (!endpoint) status.textContent = `${selected ? fullDate(selected) + '. ' : ''}Disponibilidade a confirmar pelo WhatsApp.`;
    else if (!selectedToys().length) status.textContent = 'Selecione os brinquedos para visualizar as cores de disponibilidade.';
    else if (selected) status.textContent = data.__schedule && periodDays(installation.value, removal.value).length
      ? `Disponibilidade para os horários informados, incluindo ${data.__schedule.turnaroundMinutes} minutos de desmontagem e transporte.`
      : `${fullDate(selected)}: informe instalação e retirada para consultar os horários exatos.`;
    else status.textContent = 'Agenda atualizada. Para sua seleção: verde, todos disponíveis; amarelo, disponibilidade parcial; vermelho, todos indisponíveis.';
    renderDetails();
    renderSuggestions();
    validateDates();
  }

  function select(day) {
    if (day < dateKey(new Date()) || blockedDates.includes(day)) return;
    notice.textContent = '';
    selected = day;
    // Trocar o dia mantém horário e duração de um período já preenchido.
    const next = moveRentalDate(day, installation.value, removal.value);
    installation.value = next.start;
    removal.value = next.end;
    installation.dispatchEvent(new Event('change', { bubbles: true }));
    render();
    days.querySelector(`[data-date="${day}"]`)?.focus();
  }

  async function refresh() {
    request?.abort();
    data = {};
    blockedDates = [];
    failed = false;
    if (!endpoint) { render(); return; }
    const controller = new AbortController();
    request = controller;
    loading = true;
    render();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      // Inclui a data selecionada mesmo ao navegar para outro mês.
      const monthsSet = new Set([dateKey(month).slice(0, 7), selected.slice(0, 7)].filter(Boolean));
      if (periodDays(installation.value, removal.value).length) {
        const until = new Date(removal.value);
        until.setDate(until.getDate() + 91);
        const cursor = monthStart(new Date(installation.value));
        while (cursor <= until) {
          monthsSet.add(dateKey(cursor).slice(0, 7));
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
      const lastVisible = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
      const extraDays = Math.ceil((new Date(removal.value) - new Date(installation.value)) / 86400000);
      if (extraDays > 0 && extraDays <= 366) {
        lastVisible.setDate(lastVisible.getDate() + extraDays + 1);
        const cursor = monthStart(month);
        while (cursor <= lastVisible) { monthsSet.add(dateKey(cursor).slice(0,7)); cursor.setMonth(cursor.getMonth()+1); }
      }
      const months = [...monthsSet];
      const results = await Promise.all(months.map(async (key) => {
        const url = new URL(endpoint, location.href);
        url.searchParams.set('month', key);
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Agenda indisponível');
        const payload = await response.json();
        if (!payload.days || typeof payload.days !== 'object' || Array.isArray(payload.days)) throw new Error('Agenda inválida');
        if (payload.blockedDates !== undefined && (!Array.isArray(payload.blockedDates) || !payload.blockedDates.every((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)))) throw new Error('Bloqueios inválidos');
        return { days: payload.days, blockedDates: payload.blockedDates || [], schedule: payload.schedule };
      }));
      if (request !== controller) return;
      data = Object.assign({}, ...results.map((result) => result.days));
      blockedDates = [...new Set(results.flatMap((result) => result.blockedDates))];
      if (results.every((result) => result.schedule)) {
        const schedules = results.map((result) => result.schedule);
        const minutes = schedules[0].turnaroundMinutes;
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440 || schedules.some((item) => item.turnaroundMinutes !== minutes || !Array.isArray(item.busy))) throw new Error('Agenda inconsistente');
        data.__schedule = { turnaroundMinutes: minutes, months: schedules.map((item) => item.month), busy: schedules.flatMap((item) => item.busy) };
      }
    } catch {
      if (request !== controller) return;
      data = {};
      blockedDates = [];
      failed = true;
    } finally {
      clearTimeout(timeout);
      if (request === controller) { loading = false; render(); }
    }
  }

  function move(offset) {
    month = new Date(month.getFullYear(), month.getMonth() + offset, 1, 12);
    refresh();
  }
  previous.addEventListener('click', () => move(-1));
  document.getElementById('calProximo').addEventListener('click', () => move(1));
  document.getElementById('calHoje').addEventListener('click', () => { month = monthStart(new Date()); refresh(); });
  installation.addEventListener('change', () => {
    selected = installation.value.slice(0, 10);
    if (selected && selected.slice(0, 7) !== dateKey(month).slice(0, 7)) {
      month = monthStart(new Date(`${selected}T12:00:00`));
      refresh();
    } else refresh();
  });
  toys.forEach((toy) => toy.addEventListener('change', () => {
    if (toy.checked) wanted.add(toy.value); else wanted.delete(toy.value);
    render();
  }));
  removal.addEventListener('change', refresh);
  document.getElementById('reservaForm').addEventListener('submit', validateDates, true);
  // Revalida hoje na virada do dia e atualiza a API, quando conectada.
  let lastToday = dateKey(new Date());
  setInterval(() => {
    const today = dateKey(new Date());
    if (!document.hidden && (endpoint || today !== lastToday)) refresh();
    lastToday = today;
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('online', () => { if (!document.hidden) refresh(); });
  refresh();
})();
