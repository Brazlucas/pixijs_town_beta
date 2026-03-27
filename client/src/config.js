// ============================================================
//  config.js — Constantes compartilhadas do cliente
// ============================================================
(function (window) {
  'use strict';

  const SPRITE_SCALE = 1.5;
  const FRAME_H      = 48;

  window.GameConfig = Object.freeze({
    VIEWPORT_W:   1200,
    VIEWPORT_H:   800,
    TILE:         64,
    PLAYER_SPEED: 3,
    LERP_FACTOR:  0.12,
    SEND_MS:      50,
    SPRITE_SCALE,
    FRAME_H,
    DESK_AREA:    256,
    LABEL_Y:      -(FRAME_H * SPRITE_SCALE * 0.9) - 6,
  });
})(window);
