// ============================================================
//  input.js — Gerenciador de input de teclado
// ============================================================
(function (window) {
  'use strict';

  class InputManager {
    constructor() {
      this._keys      = {};
      this._listeners = [];

      this._handleDown = (e) => {
        this._keys[e.code] = true;
        this._listeners.forEach(fn => fn(e));
      };
      this._handleUp = (e) => { this._keys[e.code] = false; };

      window.addEventListener('keydown', this._handleDown);
      window.addEventListener('keyup',   this._handleUp);
    }

    /** Retorna true se a tecla está pressionada */
    isDown(code) { return !!this._keys[code]; }

    /** Registra um callback para keydown (para atalhos como E, C) */
    onKeyDown(fn) { this._listeners.push(fn); }
  }

  window.InputManager = InputManager;
})(window);
