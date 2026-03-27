// ============================================================
//  welcome.js — Modal de boas-vindas + persistência localStorage
// ============================================================
(function (window) {
  'use strict';

  const STORAGE_KEY = 'gather_profile';

  /** Carrega o perfil salvo ou retorna null */
  function loadProfile() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      return null;
    }
  }

  /** Salva o perfil no localStorage */
  function saveProfile(profile) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }

  /** Abre o modal e retorna Promise<{name, gender}> */
  function showWelcomeModal() {
    return new Promise((resolve) => {
      const modal   = document.getElementById('welcome-modal');
      const input   = document.getElementById('input-name');
      const btn     = document.getElementById('btn-enter');
      const genders = document.querySelectorAll('.gender-opt');
      let gender    = 'male';

      genders.forEach(g => g.addEventListener('click', () => {
        genders.forEach(b => b.classList.remove('active'));
        g.classList.add('active');
        gender = g.dataset.gender;
      }));

      const submit = () => {
        const name = input.value.trim() || 'Anônimo';
        modal.style.display = 'none';
        resolve({ name, gender });
      };

      btn.addEventListener('click', submit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      input.focus();
    });
  }

  /** Esconde o modal (para quando o perfil já existe) */
  function hideWelcomeModal() {
    document.getElementById('welcome-modal').style.display = 'none';
  }

  window.WelcomeManager = { loadProfile, saveProfile, showWelcomeModal, hideWelcomeModal };
})(window);
