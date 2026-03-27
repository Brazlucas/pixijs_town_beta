// ============================================================
//  player.js — Criação e animação de sprites de jogadores
// ============================================================
(function (window) {
  'use strict';

  const C = window.GameConfig;

  const PlayerFactory = {

    /**
     * Retorna o set de animações para uma cor/gênero.
     * Usa atlas compartilhado se disponível, senão gera proceduralmente.
     */
    getAnimations(app, color, gender, useAtlas, sharedAnimations) {
      if (useAtlas) return sharedAnimations;
      return window.GatherSprites.createCharacterTextures(app, color, gender || 'male');
    },

    /**
     * Cria o container PIXI de um jogador (AnimatedSprite + nome + indicador).
     */
    createSprite(animations, name, isLocal, color, useAtlas) {
      const container = new PIXI.Container();

      // ── AnimatedSprite ──────────────────────────────────────────────────
      const initialTex = animations.idle || animations.walk_down;
      const anim       = new PIXI.AnimatedSprite(initialTex);
      anim.anchor.set(0.5, 0.9);
      anim.scale.set(C.SPRITE_SCALE);
      anim.animationSpeed = 0.05;
      anim.loop = true;
      anim.play();
      if (useAtlas) anim.tint = color;

      container._anim    = anim;
      container._anims   = animations;
      container._curAnim = 'idle';
      container.addChild(anim);

      // ── Label de nome ───────────────────────────────────────────────────
      const label = new PIXI.Text(name, {
        fontSize:        11,
        fill:            0xffffff,
        fontFamily:      'Inter, sans-serif',
        fontWeight:      isLocal ? 'bold' : 'normal',
        dropShadow:      true,
        dropShadowColor: 0x000000,
        dropShadowBlur:  3,
        dropShadowDistance: 1,
      });
      label.anchor.set(0.5, 1);
      label.y    = C.LABEL_Y;
      label.name = 'nameLabel';
      container.addChild(label);

      // ── Indicador "você" ────────────────────────────────────────────────
      if (isLocal) {
        const arrow = new PIXI.Text('▼', {
          fontSize: 11, fill: 0xffd700,
          dropShadow: true, dropShadowColor: 0x000000, dropShadowDistance: 1,
        });
        arrow.anchor.set(0.5, 0);
        arrow.y = 4;
        container.addChild(arrow);
      }

      return container;
    },

    /**
     * Troca a animação ativa de um container.
     * Não reinicia se já for a mesma (evita flickering).
     */
    setAnimation(container, animName) {
      if (container._curAnim === animName) return;
      const anim  = container._anim;
      const anims = container._anims;
      if (!anim || !anims) return;

      const textures = anims[animName] || anims.idle;
      if (!textures || textures.length === 0) return;

      anim.textures       = textures;
      anim.animationSpeed = animName === 'idle' ? 0.05 : 0.15;
      anim.gotoAndPlay(0);
      container._curAnim = animName;
    },

    /** Substitui texturas quando o gênero muda */
    rebuildAnimations(container, animations) {
      container._anims   = animations;
      container._curAnim = null;
      this.setAnimation(container, 'idle');
    },

    /** Atualiza o texto do label de nome */
    updateNameLabel(container, name) {
      const label = container.children.find(c => c.name === 'nameLabel');
      if (label) label.text = name;
    },
  };

  window.PlayerFactory = PlayerFactory;
})(window);
