// ============================================================
//  sprites.js — Gerador procedural de pixel art para os personagens
//
//  Gera texturas PixiJS em memória via RenderTexture, sem necessidade
//  de arquivos externos (player.png / player.json).
//
//  Expõe: window.GatherSprites.createCharacterTextures(app, color)
//  Retorna: { idle, walk_down, walk_up, walk_left, walk_right }
//           onde cada chave é um array de PIXI.RenderTexture
// ============================================================
(function (window) {
  'use strict';

  // Dimensões de cada frame (pixels lógicos — serão escalados em main.js)
  const FRAME_W = 32;
  const FRAME_H = 48;
  const FRAMES = 4; // frames por direção de caminhada

  // ─── Utilitário de cor ─────────────────────────────────────────────────────

  function darken(hex, amount) {
    const r = Math.max(0, ((hex >> 16) & 0xff) - amount);
    const g = Math.max(0, ((hex >> 8) & 0xff) - amount);
    const b = Math.max(0, (hex & 0xff) - amount);
    return (r << 16) | (g << 8) | b;
  }

  // ─── Renderização de um único frame ───────────────────────────────────────

  /**
   * Ponto de entrada: delega para drawFrontBack() ou drawSide()
   * conforme a direção, depois baka tudo numa RenderTexture.
   */
  function renderFrame(renderer, direction, frameIndex, bodyColor, gender) {
    const g = new PIXI.Graphics();

    if (direction === 'left' || direction === 'right') {
      drawSide(g, direction, frameIndex, bodyColor, gender);
    } else {
      drawFrontBack(g, direction, frameIndex, bodyColor, gender);
    }

    const rt = PIXI.RenderTexture.create({ width: FRAME_W, height: FRAME_H });
    renderer.render(g, { renderTexture: rt });
    g.destroy();
    return rt;
  }

  // ─── Vista frontal / costas ('down' | 'up') ────────────────────────────────

  /**
   * Corpo de frente (down) ou de costas (up).
   * As pernas osciclam lateralmente (esq ↔ dir) para simular caminhada.
   */
  function drawFrontBack(g, direction, frameIndex, bodyColor, gender) {
    const W = FRAME_W, H = FRAME_H, CX = W / 2;
    const SKIN = 0xFFD59A;
    const HAIR = darken(SKIN, 90);
    const legColor = darken(bodyColor, 60);
    const armColor = darken(bodyColor, 25);

    // Oscilação lateral das pernas: 0=neutro, 1=esq.frente, 2=neutro, 3=dir.frente
    const SWING = [0, 6, 0, -6];
    const sw = SWING[frameIndex];

    // Sombra
    g.beginFill(0x000000, 0.18);
    g.drawEllipse(CX, H - 2, 8, 2.5);
    g.endFill();

    // Pernas
    g.beginFill(legColor);
    g.drawRect(CX - 7, H - 18 - sw, 5, 11);
    g.endFill();
    g.beginFill(legColor);
    g.drawRect(CX + 2, H - 18 + sw, 5, 11);
    g.endFill();

    // Torso
    g.beginFill(bodyColor);
    g.drawRoundedRect(CX - 8, H - 33, 16, 13, 3);
    g.endFill();

    // Braços (oscilam ao contrário das pernas)
    g.beginFill(armColor);
    g.drawRoundedRect(CX - 13, H - 32 + sw * 0.6, 5, 9, 2);
    g.endFill();
    g.beginFill(armColor);
    g.drawRoundedRect(CX + 8, H - 32 - sw * 0.6, 5, 9, 2);
    g.endFill();

    // Cabeça
    g.beginFill(SKIN);
    g.drawCircle(CX, H - 41, 9);
    g.endFill();

    // ── Cabelo — forma varia conforme o gênero ───────────────────────────────
    // Referência de coordenadas (H=48):
    //   H-51 = y=-3 (clipado a 0) | H-48 = y=0 | cabeça: centro y=7, raio=9
    //   torso começa em y=15; H-48+22 = y=22 (meio do torso)
    g.beginFill(HAIR);
    g.drawRect(CX - 9, H - 51, 18, 7); // franja/topo — igual para ambos

    if (gender === 'female') {
      if (direction === 'up') {
        // Costas: cabelo largo cobrindo nuca e parte superior das costas
        g.drawRect(CX - 9, H - 48, 18, 18);
      } else {
        // Frente: mechas longas caindo pelos dois lados até o nível do ombro
        g.drawRect(CX - 12, H - 48, 5, 22); // mecha esquerda
        g.drawRect(CX + 7, H - 48, 5, 22); // mecha direita
      }
    } else {
      // Masculino: cabelo curto — pequenas mechas laterais
      if (direction !== 'up') {
        g.drawRect(CX - 9, H - 51, 3, 10);
        g.drawRect(CX + 6, H - 51, 3, 10);
      }
    }
    g.endFill();

    if (direction === 'down') {
      g.beginFill(0x1a1a2e);
      g.drawCircle(CX - 3, H - 42, 2);
      g.drawCircle(CX + 3, H - 42, 2);
      g.endFill();
      g.beginFill(0xff7979, 0.9);
      g.drawRect(CX - 2, H - 38, 4, 2);
      g.endFill();
    } else {
      // 'up': cobre a cabeça com cabelo (costas)
      g.beginFill(HAIR);
      g.drawCircle(CX, H - 41, 9);
      g.endFill();
    }
  }

  // ─── Vista lateral ('left' | 'right') ─────────────────────────────────────

  /**
   * Corpo em perfil.
   *
   * Diferenças visuais chave em relação à vista frontal:
   *   • Torso estreito (~10 px) — silhueta de perfil
   *   • Braço traseiro desenhado antes do torso (fica "atrás")
   *   • Braço dianteiro desenhado depois do torso (fica "na frente")
   *   • Pernas alternam frente/trás usando deslocamento em X e Y:
   *       - perna dianteira: mais à frente no eixo de deslocamento + levemente mais baixa
   *       - perna traseira: atrás + levemente elevada (mid-swing)
   *   • Bob do corpo: -1 px em frames de passada (1 e 3)
   *   • Cabeça deslocada para o lado da direção
   *   • Nariz pontua para fora; único olho visível
   */
  function drawSide(g, direction, frameIndex, bodyColor, gender) {
    const W = FRAME_W, H = FRAME_H, CX = W / 2;
    const SKIN = 0xFFD59D;
    const HAIR = darken(SKIN, 90);
    const legColor = darken(bodyColor, 60);
    const armColor = darken(bodyColor, 25);

    // +1 = direita, -1 = esquerda
    const d = direction === 'right' ? 1 : -1;

    // Frames de passada (mid-stride): corpo sobe 1px (bob)
    const isStride = frameIndex === 1 || frameIndex === 3;
    const bob = isStride ? -1 : 0;

    // ── Posições das pernas ──────────────────────────────────────────────────
    // A perna "dianteira" é a que está mais à frente no sentido do movimento.
    // Ela é desenhada por último (fica em cima / na frente visualmente).
    // legFront / legBack alternam a cada passada (frames 1 e 3).
    //
    //  X: deslocamos ±3px para dar impressão de profundidade
    //  Y: perna dianteira um pouco mais baixa (planted), traseira levemente alta

    let frontLegX, frontLegY, backLegX, backLegY;

    if (!isStride) {
      // Neutro: pernas agrupadas no centro
      frontLegX = CX - 1; frontLegY = H - 18;
      backLegX = CX - 1; backLegY = H - 18;
    } else if (frameIndex === 1) {
      // Passada A: perna direita à frente (para direction=right)
      frontLegX = CX + d * 3 - 1; frontLegY = H - 17; // planted, um pouco mais baixa
      backLegX = CX - d * 2 - 1; backLegY = H - 21; // mid-swing, levantada
    } else {
      // Passada B: perna esquerda à frente
      frontLegX = CX - d * 2 - 1; frontLegY = H - 17;
      backLegX = CX + d * 3 - 1; backLegY = H - 21;
    }

    // ── Posições dos braços ──────────────────────────────────────────────────
    // Braço dianteiro oscila para a frente (oposto à perna dianteira para ritmo)
    // Braço traseiro oscila para trás
    let frontArmDY, backArmDY; // deslocamento vertical do swing
    if (!isStride) {
      frontArmDY = 0; backArmDY = 0;
    } else if (frameIndex === 1) {
      frontArmDY = -4; backArmDY = +4; // frente sobe, trás desce
    } else {
      frontArmDY = +4; backArmDY = -4;
    }

    // ── Sombra ───────────────────────────────────────────────────────────────
    g.beginFill(0x000000, 0.18);
    g.drawEllipse(CX, H - 2, 7, 2.5);
    g.endFill();

    // ── Perna traseira (desenhada antes = fica atrás do torso) ───────────────
    g.beginFill(darken(legColor, 25));
    g.drawRoundedRect(backLegX, backLegY + bob, 4, 11, 1);
    g.endFill();

    // ── Braço traseiro (atrás do torso) ──────────────────────────────────────
    g.beginFill(darken(armColor, 30));
    g.drawRoundedRect(CX - 2, H - 32 + backArmDY + bob, 4, 9, 2);
    g.endFill();

    // ── Torso estreito (perfil: ~10 px) ──────────────────────────────────────
    g.beginFill(bodyColor);
    g.drawRoundedRect(CX - 5, H - 33 + bob, 10, 13, 3);
    g.endFill();

    // ── Braço dianteiro (na frente do torso) ─────────────────────────────────
    g.beginFill(armColor);
    g.drawRoundedRect(CX - 2, H - 32 + frontArmDY + bob, 4, 9, 2);
    g.endFill();

    // ── Perna dianteira (na frente do torso) ─────────────────────────────────
    g.beginFill(legColor);
    g.drawRoundedRect(frontLegX, frontLegY + bob, 4, 11, 1);
    g.endFill();

    // ── Cabeça (deslocada levemente para o lado que o personagem olha) ────────
    const hx = CX + d * 2; // leve offset no perfil
    g.beginFill(SKIN);
    g.drawCircle(hx, H - 41 + bob, 9);
    g.endFill();

    // ── Cabelo (perfil) — comprimento varia por gênero ──────────────────────
    // A mecha traseira fica no lado OPOSTO à direção do olhar.
    // Masculino: mecha curta (~9 px visíveis)
    // Feminino:  mecha longa (~24 px), mais larga, flui além do ombro
    g.beginFill(HAIR);
    g.drawRect(hx - 9, H - 51 + bob, 17, 7);  // franja/topo (igual para ambos)
    const trailX = d > 0 ? hx - 11 : hx + 4;  // início da mecha traseira
    if (gender === 'female') {
      g.drawRect(trailX, H - 48 + bob, 7, 24); // longa: y=0..24, largura=7
    } else {
      g.drawRect(trailX, H - 51 + bob, 4, 12); // curta: y≈0..9, largura=4
    }
    g.endFill();

    // ── Olho (perfil: único, no lado para onde olha) ──────────────────────────
    const eyeX = hx + d * 5;
    g.beginFill(0x1a1a2e);
    g.drawCircle(eyeX, H - 42 + bob, 1.5);
    g.endFill();

    // ── Nariz (pontua para fora no sentido do movimento) ──────────────────────
    const noseX = d > 0 ? hx + 8 : hx - 11;
    g.beginFill(darken(SKIN, 35));
    g.drawRect(noseX, H - 41 + bob, 3, 2);
    g.endFill();
  }

  // ─── API pública ───────────────────────────────────────────────────────────

  /**
   * Gera o conjunto completo de animações para um personagem.
   *
   * @param {PIXI.Application} app
   * @param {number}           color  cor hex do personagem (ex: 0xff6b6b)
   * @returns {{
   *   idle:       PIXI.RenderTexture[],
   *   walk_down:  PIXI.RenderTexture[],
   *   walk_up:    PIXI.RenderTexture[],
   *   walk_left:  PIXI.RenderTexture[],
   *   walk_right: PIXI.RenderTexture[],
   * }}
   */
  function createCharacterTextures(app, color, gender) {
    gender = gender || 'male';
    const renderer = app.renderer;
    const dirs = ['down', 'up', 'left', 'right'];
    const out = {};

    dirs.forEach((dir) => {
      out[`walk_${dir}`] = Array.from(
        { length: FRAMES },
        (_, i) => renderFrame(renderer, dir, i, color, gender)
      );
    });

    // idle = frame neutro olhando para baixo (1 frame em loop lento)
    out.idle = [renderFrame(renderer, 'down', 0, color, gender)];

    return out;
  }

  // Expõe no escopo global (sem bundler)
  window.GatherSprites = { createCharacterTextures };

})(window);
