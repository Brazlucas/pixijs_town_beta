// ============================================================
//  actions.js — Ações de jogador, bolhas, indicadores e detecção de zonas
// ============================================================
(function (window) {
  'use strict';

  const C = window.GameConfig;

  const Actions = {

    /**
     * Mostra uma bolha de emoji flutuante acima do sprite.
     * @param {PIXI.Application} app
     * @param {PIXI.Container}   container  sprite do jogador
     * @param {string}           action     ex: 'coffee'
     */
    showBubble(app, container, action) {
      const EMOJIS = { coffee: '☕' };
      const emoji  = EMOJIS[action] || '❓';

      const bubble = new PIXI.Text(emoji, { fontSize: 20, fill: 0xffffff });
      bubble.anchor.set(0.5, 1);
      bubble.y = C.LABEL_Y - 16;
      container.addChild(bubble);

      let frame = 0;
      const tick = () => {
        frame++;
        bubble.y    -= 0.3;
        bubble.alpha = Math.max(0, 1 - frame / 120);
        if (frame >= 120) {
          app.ticker.remove(tick);
          container.removeChild(bubble);
          bubble.destroy();
        }
      };
      app.ticker.add(tick);
    },

    /**
     * Atualiza indicador de microfone no sprite de um jogador.
     * @param {PIXI.Container} container
     * @param {boolean} active    está em sala de voz?
     * @param {boolean} [speaking]  está falando?
     */
    updateVoiceIndicator(container, active, speaking) {
      let mic = container.children.find(c => c.name === 'micIcon');

      if (active && !mic) {
        mic       = new PIXI.Text('🎤', { fontSize: 12 });
        mic.anchor.set(0.5, 1);
        mic.y     = C.LABEL_Y - 14;
        mic.name  = 'micIcon';
        container.addChild(mic);
      }

      if (!active && mic) {
        container.removeChild(mic);
        mic.destroy();
        return;
      }

      if (mic && speaking !== undefined) {
        mic.alpha = speaking ? 1 : 0.4;
        mic.scale.set(speaking ? 1.2 : 1);
      }
    },

    /**
     * Detecta em qual zona de voz o jogador está (sala ou área de mesa reservada).
     * @returns {string|null}  ID da zona ou null
     */
    detectVoiceZone(px, py, rooms, desks) {
      const half = C.DESK_AREA / 2;

      for (const room of rooms) {
        if (px >= room.x && px <= room.x + room.w && py >= room.y && py <= room.y + room.h) {
          return room.id;
        }
      }

      for (const desk of desks) {
        if (!desk.ownerId) continue;
        if (Math.abs(px - desk.x) < half && Math.abs(py - desk.y) < half) {
          return desk.id;
        }
      }

      return null;
    },
  };

  window.Actions = Actions;
})(window);
