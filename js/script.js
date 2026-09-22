// ============================================
// BLACK WHITE FESTAS — script.js
// ============================================

// Menu mobile: abre e fecha ao clicar no botão
const navToggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');

if (navToggle && nav) {
  navToggle.addEventListener('click', () => {
    const aberto = nav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  });

  // fecha o menu automaticamente ao clicar em um link
  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Atualiza o ano no rodapé automaticamente
const ano = document.getElementById('ano');
if (ano) {
  ano.textContent = new Date().getFullYear();
}

// Atualiza a estimativa da reserva conforme o brinquedo e a região escolhidos.
const reservaForm = document.getElementById('reservaForm');
const brinquedo = document.getElementById('rBrinquedo');
const regiao = document.getElementById('rRegiao');
const resumoBrinquedo = document.getElementById('resumoBrinquedo');
const resumoTaxa = document.getElementById('resumoTaxa');
const resumoTotal = document.getElementById('resumoTotal');

const moeda = (valor) => valor.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

function atualizarResumo() {
  const preco = Number(brinquedo?.selectedOptions[0]?.dataset.preco || 0);
  const taxaSelecionada = regiao?.selectedOptions[0];
  const taxa = taxaSelecionada?.dataset.taxa;

  if (resumoBrinquedo) resumoBrinquedo.textContent = moeda(preco);
  if (resumoTaxa) resumoTaxa.textContent = taxa ? moeda(Number(taxa)) : 'Selecione a região';
  if (resumoTotal) resumoTotal.textContent = taxa ? moeda(preco + Number(taxa)) : '—';
}

brinquedo?.addEventListener('change', atualizarResumo);
regiao?.addEventListener('change', atualizarResumo);
atualizarResumo();

reservaForm?.addEventListener('submit', (evento) => {
  evento.preventDefault();

  const nome = document.getElementById('rNome').value.trim();
  const endereco = document.getElementById('rEndereco').value.trim();
  const instalacao = document.getElementById('rInstalacao').value;
  const desinstalacao = document.getElementById('rDesinstalacao').value;
  const taxa = regiao.selectedOptions[0].dataset.taxa;

  if (!taxa) {
    regiao.focus();
    return;
  }

  if (new Date(desinstalacao) <= new Date(instalacao)) {
    alert('A desinstalação precisa acontecer depois da instalação.');
    document.getElementById('rDesinstalacao').focus();
    return;
  }

  const preco = Number(brinquedo.selectedOptions[0].dataset.preco);
  const mensagem = [
    'Oi! Quero pedir um orçamento para uma festa.',
    `Nome: ${nome}`,
    `Brinquedo: ${brinquedo.selectedOptions[0].textContent.trim()}`,
    `Região: ${regiao.value}`,
    `Endereço: ${endereco}`,
    `Instalação: ${instalacao.replace('T', ' ')}`,
    `Desinstalação: ${desinstalacao.replace('T', ' ')}`,
    `Total estimado: ${moeda(preco + Number(taxa))}`
  ].join('\n');

  window.open(`https://wa.me/5541995960567?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener');
});
