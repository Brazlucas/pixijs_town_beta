// ============================================================
//  hud.js — Gerenciamento da interface do HUD
// ============================================================
(function (window) {
  'use strict';

  const Hud = {

    setPlayerName(name) {
      document.querySelector('#player-name strong').textContent = name;
    },

    updatePlayerCount(n) {
      document.querySelector('#player-count strong').textContent = n;
    },

    setVoiceActive(active) {
      document.getElementById('voice-indicator').classList.toggle('on', active);
    },

    setMuteState(muted) {
      document.getElementById('btn-mute').textContent = muted ? '🔇 Muted' : '🎤 Mic';
    },

    /**
     * Liga callbacks aos botões do HUD.
     * @param {{ onCoffee: Function, onClaim: Function, onMute: Function }} callbacks
     */
    bindButtons(callbacks) {
      document.getElementById('btn-coffee').addEventListener('click', callbacks.onCoffee);
      document.getElementById('btn-claim').addEventListener('click',  callbacks.onClaim);
      document.getElementById('btn-mute').addEventListener('click',   callbacks.onMute);
    },
  };

  window.Hud = Hud;
})(window);
