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
