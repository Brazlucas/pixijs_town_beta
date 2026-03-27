// ============================================================
//  camera.js — Camera viewport que segue o jogador
// ============================================================
(function (window) {
  'use strict';

  class Camera {
    /**
     * @param {PIXI.Container} worldContainer  container raiz do mundo
     * @param {number} viewportW  largura da viewport (px)
     * @param {number} viewportH  altura da viewport (px)
     */
    constructor(worldContainer, viewportW, viewportH) {
      this.world = worldContainer;
      this.vw    = viewportW;
      this.vh    = viewportH;
      this.mapW  = 0;
      this.mapH  = 0;
    }

    setMapSize(w, h) {
      this.mapW = w;
      this.mapH = h;
    }

    /** Centraliza a câmera na posição (x, y), clamped às bordas do mapa */
    follow(x, y) {
      this.world.x = Math.min(0, Math.max(-(this.mapW - this.vw), this.vw / 2 - x));
      this.world.y = Math.min(0, Math.max(-(this.mapH - this.vh), this.vh / 2 - y));
    }
  }

  window.Camera = Camera;
})(window);
