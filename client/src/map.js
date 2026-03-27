// ============================================================
//  map.js — Renderização do mapa de escritório (PixiJS Graphics)
// ============================================================
(function (window) {
  'use strict';

  const C = window.GameConfig;

  const OfficeMap = {

    /**
     * Desenha o mapa completo (chão, paredes, salas, mesas, decoração).
     * @param {PIXI.Container} mapLayer       camada de fundo (chão)
     * @param {PIXI.Container} furnitureLayer  camada de móveis
     * @param {number} mapW  largura do mapa
     * @param {number} mapH  altura do mapa
     * @param {Array}  rooms  definições das salas
     * @param {Array}  desks  definições das mesas
     */
    draw(mapLayer, furnitureLayer, mapW, mapH, rooms, desks) {
      mapLayer.removeChildren();
      furnitureLayer.removeChildren();

      this._drawFloor(mapLayer, mapW, mapH);
      this._drawWalls(furnitureLayer, mapW, mapH);

      rooms.forEach(room => this._drawRoom(furnitureLayer, room));
      desks.forEach(desk => this._drawDesk(furnitureLayer, desk.x, desk.y));

      this._drawCoffeeArea(furnitureLayer, 200, mapH - 350);
      this._drawWhiteboard(furnitureLayer, 2600, 200);

      const plantPositions = [
        { x: 80,   y: 700  }, { x: 2500, y: 700  }, { x: 80,   y: 1200 },
        { x: 2500, y: 1200 }, { x: 1200, y: 1700 }, { x: 2000, y: 1700 },
        { x: 800,  y: 1700 }, { x: 2800, y: 400  }, { x: 2800, y: 900  },
      ];
      plantPositions.forEach(p => this._drawPlant(furnitureLayer, p.x, p.y));
    },

    /**
     * Desenha os overlays de áreas das mesas (contornos + labels de dono).
     */
    drawDeskAreas(areaLayer, desks, localSocketId) {
      areaLayer.removeChildren();
      const half = C.DESK_AREA / 2;

      desks.forEach(desk => {
        const g       = new PIXI.Graphics();
        const isMine  = desk.ownerId === localSocketId;
        const claimed = !!desk.ownerId;

        if (claimed) {
          g.beginFill(isMine ? 0x6c5ce7 : 0x4ecdc4, 0.08);
          g.drawRoundedRect(desk.x - half, desk.y - half, C.DESK_AREA, C.DESK_AREA, 8);
          g.endFill();
        }

        g.lineStyle(2, claimed ? (isMine ? 0x6c5ce7 : 0x4ecdc4) : 0x555555, claimed ? 0.5 : 0.15);
        g.drawRoundedRect(desk.x - half, desk.y - half, C.DESK_AREA, C.DESK_AREA, 8);
        areaLayer.addChild(g);

        if (desk.ownerName) {
          const label = new PIXI.Text(desk.ownerName, {
            fontSize: 10, fill: isMine ? 0xa29bfe : 0x7ecec4,
            fontFamily: 'Inter, sans-serif', fontWeight: '500',
            dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 2, dropShadowDistance: 1,
          });
          label.anchor.set(0.5, 0);
          label.x = desk.x;
          label.y = desk.y - half + 4;
          areaLayer.addChild(label);
        }
      });
    },

    // ─── Private Drawing Methods ──────────────────────────────────────────

    _drawFloor(layer, mapW, mapH) {
      for (let r = 0; r < Math.ceil(mapH / C.TILE); r++) {
        for (let c = 0; c < Math.ceil(mapW / C.TILE); c++) {
          const g    = new PIXI.Graphics();
          const base = (r + c) % 2 === 0 ? 0x484858 : 0x434353;
          g.beginFill(base);
          g.drawRect(c * C.TILE, r * C.TILE, C.TILE, C.TILE);
          g.endFill();
          g.lineStyle(1, 0x3a3a4a, 0.5);
          g.drawRect(c * C.TILE, r * C.TILE, C.TILE, C.TILE);
          layer.addChild(g);
        }
      }
    },

    _drawWalls(layer, mapW, mapH) {
      const wall = new PIXI.Graphics();
      wall.beginFill(0x5a5a6e);
      wall.drawRect(0, 0, mapW, 16);
      wall.drawRect(0, 0, 16, mapH);
      wall.drawRect(mapW - 16, 0, 16, mapH);
      wall.drawRect(0, mapH - 16, mapW, 16);
      wall.endFill();
      wall.lineStyle(2, 0x6c5ce7, 0.3);
      wall.moveTo(16, 16);
      wall.lineTo(mapW - 16, 16);
      layer.addChild(wall);
    },

    _drawRoom(layer, room) {
      const { x, y, w, h, name } = room;
      const wallThick = 8;
      const doorW     = 80;

      // Paredes de vidro
      const g = new PIXI.Graphics();
      g.beginFill(0x6a7a9a, 0.25);
      g.drawRect(x, y, w, wallThick);
      g.drawRect(x, y, wallThick, h);
      g.drawRect(x + w - wallThick, y, wallThick, h);
      g.drawRect(x, y + h - wallThick, (w - doorW) / 2, wallThick);
      g.drawRect(x + (w + doorW) / 2, y + h - wallThick, (w - doorW) / 2, wallThick);
      g.endFill();
      g.lineStyle(1, 0x8a9abe, 0.4);
      g.drawRect(x, y, w, h);
      layer.addChild(g);

      // Label da sala
      const label = new PIXI.Text(name, {
        fontSize: 13, fill: 0xaabbdd, fontFamily: 'Inter, sans-serif', fontWeight: '600',
        dropShadow: true, dropShadowColor: 0x000000, dropShadowBlur: 2, dropShadowDistance: 1,
      });
      label.anchor.set(0.5, 1);
      label.x = x + w / 2;
      label.y = y - 4;
      layer.addChild(label);

      // Mesa de reunião
      const table = new PIXI.Graphics();
      table.beginFill(0x6b4c3b);
      table.drawRoundedRect(x + w / 2 - 60, y + h / 2 - 25, 120, 50, 8);
      table.endFill();
      table.beginFill(0x7d5e4c);
      table.drawRoundedRect(x + w / 2 - 55, y + h / 2 - 20, 110, 40, 6);
      table.endFill();
      layer.addChild(table);

      // Cadeiras
      [
        { cx: x + w / 2 - 40, cy: y + h / 2 - 40 },
        { cx: x + w / 2 + 40, cy: y + h / 2 - 40 },
        { cx: x + w / 2 - 40, cy: y + h / 2 + 40 },
        { cx: x + w / 2 + 40, cy: y + h / 2 + 40 },
      ].forEach(cp => this._drawChair(layer, cp.cx, cp.cy));
    },

    _drawDesk(layer, x, y) {
      const g = new PIXI.Graphics();
      g.beginFill(0x6b4c3b);
      g.drawRoundedRect(x - 50, y - 20, 100, 40, 4);
      g.endFill();
      g.beginFill(0x7d5e4c);
      g.drawRoundedRect(x - 45, y - 16, 90, 32, 3);
      g.endFill();
      // Monitor
      g.beginFill(0x2a2a3a);
      g.drawRoundedRect(x - 14, y - 16, 28, 20, 2);
      g.endFill();
      g.beginFill(0x4a9eff, 0.6);
      g.drawRoundedRect(x - 12, y - 14, 24, 16, 1);
      g.endFill();
      // Suporte
      g.beginFill(0x555555);
      g.drawRect(x - 3, y + 4, 6, 4);
      g.endFill();
      layer.addChild(g);

      this._drawChair(layer, x, y + 35);
    },

    _drawChair(layer, cx, cy) {
      const g = new PIXI.Graphics();
      g.beginFill(0x3a3a4a);
      g.drawRoundedRect(cx - 8, cy - 8, 16, 16, 4);
      g.endFill();
      g.beginFill(0x4a4a5a);
      g.drawRoundedRect(cx - 6, cy - 10, 12, 6, 2);
      g.endFill();
      layer.addChild(g);
    },

    _drawCoffeeArea(layer, x, y) {
      const counter = new PIXI.Graphics();
      counter.beginFill(0x5a4a3a);
      counter.drawRoundedRect(x - 60, y, 180, 60, 6);
      counter.endFill();
      counter.beginFill(0x6b5a4a);
      counter.drawRoundedRect(x - 55, y + 5, 170, 50, 4);
      counter.endFill();
      layer.addChild(counter);

      const machine = new PIXI.Graphics();
      machine.beginFill(0x333344);
      machine.drawRoundedRect(x - 15, y - 30, 40, 30, 4);
      machine.endFill();
      machine.beginFill(0xff6b6b, 0.9);
      machine.drawCircle(x + 5, y - 20, 3);
      machine.endFill();
      layer.addChild(machine);

      const label = new PIXI.Text('☕ Café', {
        fontSize: 11, fill: 0xaaaaaa, fontFamily: 'Inter, sans-serif',
      });
      label.anchor.set(0.5, 1);
      label.x = x + 30;
      label.y = y - 34;
      layer.addChild(label);
    },

    _drawPlant(layer, x, y) {
      const g = new PIXI.Graphics();
      g.beginFill(0x5a4a3a);
      g.drawRoundedRect(x - 8, y + 6, 16, 14, 3);
      g.endFill();
      g.beginFill(0x2e8b57);
      g.drawCircle(x, y, 14);
      g.endFill();
      g.beginFill(0x3cb371);
      g.drawCircle(x - 4, y - 4, 10);
      g.endFill();
      layer.addChild(g);
    },

    _drawWhiteboard(layer, x, y) {
      const g = new PIXI.Graphics();
      g.beginFill(0xeeeeee);
      g.drawRoundedRect(x, y, 200, 120, 4);
      g.endFill();
      g.lineStyle(3, 0x888888);
      g.drawRoundedRect(x, y, 200, 120, 4);
      g.lineStyle(2, 0x4a9eff, 0.5);
      g.moveTo(x + 20, y + 30);  g.lineTo(x + 80, y + 50);
      g.moveTo(x + 40, y + 60);  g.lineTo(x + 160, y + 40);
      g.lineStyle(2, 0xff6b6b, 0.5);
      g.moveTo(x + 100, y + 70); g.lineTo(x + 170, y + 90);
      layer.addChild(g);

      const label = new PIXI.Text('Quadro', {
        fontSize: 11, fill: 0x888888, fontFamily: 'Inter, sans-serif',
      });
      label.anchor.set(0.5, 1);
      label.x = x + 100;
      label.y = y - 4;
      layer.addChild(label);
    },
  };

  window.OfficeMap = OfficeMap;
})(window);
