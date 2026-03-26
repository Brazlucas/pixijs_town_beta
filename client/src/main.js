// ============================================================
//  main.js — Lógica principal do cliente (PixiJS v7 + Socket.io)
//
//  Fluxo de assets:
//   1. Tenta carregar 'assets/player.json' (atlas real com player.png).
//   2. Se não existir, usa sprites.js para gerar pixel art procedural.
//
//  Fluxo de animação:
//   - Jogador local: input de teclado → troca animação → envia {x,y,direction}
//   - Jogadores remotos: recebe {x,y,direction} → interpola posição + troca animação
// ============================================================
(async function () {
  'use strict';

  // ─── Constantes ────────────────────────────────────────────────────────────
  const MAP_WIDTH    = 1200;
  const MAP_HEIGHT   = 800;
  const PLAYER_SPEED = 3;
  const LERP_FACTOR  = 0.12;   // suavidade da interpolação remota (0=parado, 1=snap)
  const SEND_MS      = 50;     // throttle de envio ao servidor (20 Hz)
  const SPRITE_SCALE = 1.5;    // escala do pixel art (maior = mais nítido na tela)
  const FRAME_H      = 48;     // altura do frame definida em sprites.js
  // Posição Y do label de nome, relativo ao container cujo (0,0) está nos pés
  const LABEL_Y      = -(FRAME_H * SPRITE_SCALE * 0.9) - 6; // ≈ -71

  // ─── 1. Configuração do PixiJS ─────────────────────────────────────────────
  // SCALE_MODE.NEAREST: sem interpolação bilinear → pixels nítidos (pixel art)
  PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

  const app = new PIXI.Application({
    width:           MAP_WIDTH,
    height:          MAP_HEIGHT,
    backgroundColor: 0x2d5a27,
    antialias:       false,  // desligado para manter a estética pixel art
    resolution:      window.devicePixelRatio || 1,
    autoDensity:     true,
  });

  document.getElementById('game-canvas-wrapper').appendChild(app.view);

  // ─── 2. Layers do stage ────────────────────────────────────────────────────
  const mapLayer    = new PIXI.Container();
  const playerLayer = new PIXI.Container(); // terá depth sort por Y no game loop
  app.stage.addChild(mapLayer);
  app.stage.addChild(playerLayer);

  drawMap(mapLayer, MAP_WIDTH, MAP_HEIGHT);

  // ─── 3. Carregamento de assets ─────────────────────────────────────────────
  //
  // Modo A — Atlas real (player.json + player.png):
  //   Todos os jogadores compartilham as mesmas texturas.
  //   A cor individual é aplicada via sprite.tint.
  //   Use este modo quando tiver um spritesheet desenhado manualmente.
  //
  // Modo B — Sprites procedurais (sprites.js):
  //   Cada jogador recebe seu próprio conjunto de texturas coloridas.
  //   Funciona sem nenhum arquivo de asset externo.
  //
  let sharedAnimations = null;
  let useAtlas         = false;

  try {
    const sheet      = await PIXI.Assets.load('assets/player.json');
    sharedAnimations = sheet.animations; // { walk_down: [...], walk_up: [...], ... }
    useAtlas         = true;
    console.log('[Assets] Atlas carregado:', Object.keys(sharedAnimations).join(', '));
  } catch (_) {
    console.warn('[Assets] assets/player.json não encontrado — usando sprites procedurais.');
  }

  // ─── 4. Socket.io ──────────────────────────────────────────────────────────
  const socket = io();

  let localPlayer    = null;
  const remotePlayers = new Map(); // id → { sprite, targetX, targetY, direction, color, gender }

  let lastSendTime   = 0;
  let localDirection = 'idle'; // animação atual do jogador local
  let localGender    = 'male'; // gênero do jogador local

  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.code] = true; });
  window.addEventListener('keyup',   (e) => { keys[e.code] = false; });

  // ─── 5. Eventos do Socket.io ───────────────────────────────────────────────

  // Recebido uma vez na conexão: dados do próprio jogador + lista dos demais
  socket.on('init', ({ self, players }) => {
    document.querySelector('#player-name strong').textContent = self.name;
    updatePlayerCount(players.length + 1);

    localGender = self.gender || 'male';
    const anims = getAnimations(self.color, localGender);

    localPlayer = {
      data:   { ...self, direction: 'idle' },
      sprite: createPlayerSprite(anims, self.name, true, self.color),
    };
    localPlayer.sprite.x = self.x;
    localPlayer.sprite.y = self.y;
    playerLayer.addChild(localPlayer.sprite);

    setAnimation(localPlayer.sprite, 'idle');

    players.forEach(addRemotePlayer);
  });

  // Novo jogador entrou
  socket.on('player:joined', (data) => {
    addRemotePlayer(data);
    updatePlayerCount(remotePlayers.size + 1);
  });

  // ─── PONTO CRÍTICO: posição + direção remotas ──────────────────────────────
  //
  // Ao receber 'player:moved' do servidor:
  //   1. Atualizamos targetX/targetY (não a posição direta) — o game loop
  //      vai mover o sprite suavemente até lá via LERP_FACTOR.
  //   2. Se a direção mudou, chamamos setAnimation() para trocar o ciclo
  //      de animação do sprite remoto (walk_left, walk_up, idle, etc.).
  //
  socket.on('player:moved', ({ id, x, y, direction }) => {
    const remote = remotePlayers.get(id);
    if (!remote) return;

    remote.targetX = x;
    remote.targetY = y;

    // Só troca a animação se a direção efetivamente mudou
    if (remote.direction !== direction) {
      remote.direction = direction;
      setAnimation(remote.sprite, direction);
    }
  });

  // Um jogador remoto trocou de gênero: reconstrói as texturas do sprite dele
  socket.on('player:updated', ({ id, gender }) => {
    const remote = remotePlayers.get(id);
    if (!remote) return;

    remote.gender = gender;
    const newAnims = getAnimations(remote.color, gender);
    rebuildAnimations(remote.sprite, newAnims);
  });

  // Jogador desconectou: remove sprite da tela
  socket.on('player:left', (id) => {
    const remote = remotePlayers.get(id);
    if (remote) {
      playerLayer.removeChild(remote.sprite);
      remote.sprite.destroy({ children: true });
      remotePlayers.delete(id);
      updatePlayerCount(remotePlayers.size + 1);
    }
  });

  // ─── 6. Game Loop ──────────────────────────────────────────────────────────
  app.ticker.add(() => {
    if (!localPlayer) return;

    let moved  = false;
    let newDir = null; // nome da animação alvo (ex: 'walk_left')

    // Lê input — quando múltiplas teclas estão pressionadas, a última
    // verificada tem prioridade na direção (Right > Left > Down > Up)
    if (keys['ArrowUp']    || keys['KeyW']) { localPlayer.data.y -= PLAYER_SPEED; moved = true; newDir = 'walk_up';    }
    if (keys['ArrowDown']  || keys['KeyS']) { localPlayer.data.y += PLAYER_SPEED; moved = true; newDir = 'walk_down';  }
    if (keys['ArrowLeft']  || keys['KeyA']) { localPlayer.data.x -= PLAYER_SPEED; moved = true; newDir = 'walk_left';  }
    if (keys['ArrowRight'] || keys['KeyD']) { localPlayer.data.x += PLAYER_SPEED; moved = true; newDir = 'walk_right'; }

    // Clamp: mantém dentro dos limites do mapa
    localPlayer.data.x = Math.max(16, Math.min(MAP_WIDTH  - 16, localPlayer.data.x));
    localPlayer.data.y = Math.max(16, Math.min(MAP_HEIGHT - 16, localPlayer.data.y));

    // Atualiza sprite local diretamente (sem lag — este cliente é a fonte da verdade)
    localPlayer.sprite.x = localPlayer.data.x;
    localPlayer.sprite.y = localPlayer.data.y;

    // ── Troca de animação local ──────────────────────────────────────────────
    // Ao mover: usa a animação de caminhada da direção correspondente.
    // Ao soltar as teclas: volta para 'idle'.
    const targetAnim = moved ? newDir : 'idle';
    if (targetAnim !== localDirection) {
      localDirection = targetAnim;
      setAnimation(localPlayer.sprite, localDirection);
    }

    // ── Envia posição + direção ao servidor (com throttle) ───────────────────
    // Incluir 'direction' aqui é o que permite que outros clientes renderizem
    // a animação correta ao receber 'player:moved'.
    if (moved) {
      const now = Date.now();
      if (now - lastSendTime >= SEND_MS) {
        socket.emit('player:move', {
          x:         localPlayer.data.x,
          y:         localPlayer.data.y,
          direction: localDirection,
        });
        lastSendTime = now;
      }
    }

    // ── Interpolação dos jogadores remotos ───────────────────────────────────
    // Cada frame aproxima o sprite de sua posição alvo usando LERP.
    // Fórmula: pos += (alvo - pos) * fator
    // Isso cria desaceleração suave e absorve irregularidades de rede.
    remotePlayers.forEach((remote) => {
      remote.sprite.x += (remote.targetX - remote.sprite.x) * LERP_FACTOR;
      remote.sprite.y += (remote.targetY - remote.sprite.y) * LERP_FACTOR;
    });

    // ── Depth sorting ────────────────────────────────────────────────────────
    // Jogadores com Y maior (mais "abaixo" na tela) aparecem na frente.
    playerLayer.children.sort((a, b) => a.y - b.y);
  });

  // ─── Funções Auxiliares ────────────────────────────────────────────────────

  /**
   * Retorna animações para um jogador.
   * Atlas: texturas compartilhadas + tint por cor (gênero ignorado no atlas).
   * Procedural: gera texturas únicas com cor + gênero.
   */
  function getAnimations(color, gender) {
    if (useAtlas) return sharedAnimations;
    return window.GatherSprites.createCharacterTextures(app, color, gender || 'male');
  }

  /** Cria um jogador remoto e adiciona ao mapa. */
  function addRemotePlayer(data) {
    if (remotePlayers.has(data.id)) return;

    const anims  = getAnimations(data.color, data.gender);
    const sprite = createPlayerSprite(anims, data.name, false, data.color);
    sprite.x = data.x;
    sprite.y = data.y;
    playerLayer.addChild(sprite);

    setAnimation(sprite, data.direction || 'idle');

    remotePlayers.set(data.id, {
      sprite,
      targetX:   data.x,
      targetY:   data.y,
      direction: data.direction || 'idle',
      color:     data.color,          // guardado para reconstruir texturas ao trocar gênero
      gender:    data.gender || 'male',
    });
  }

  /**
   * Substitui as texturas de animação de um container existente.
   * Usado quando o gênero muda: recria texturas sem destruir o container.
   */
  function rebuildAnimations(container, animations) {
    container._anims = animations;
    const cur = container._curAnim;
    container._curAnim = null; // força setAnimation a reaplicar
    setAnimation(container, cur || 'idle');
  }

  /**
   * Alterna o gênero do jogador local entre 'male' e 'female'.
   * Regenera as texturas e notifica o servidor.
   */
  function toggleGender() {
    if (!localPlayer) return;

    localGender = localGender === 'male' ? 'female' : 'male';

    // Atualiza o botão
    const btn = document.getElementById('gender-btn');
    btn.textContent    = localGender === 'female' ? '♀ Feminino' : '♂ Masculino';
    btn.dataset.gender = localGender;

    // Reconstrói as texturas com o novo gênero
    const newAnims = getAnimations(localPlayer.data.color, localGender);
    rebuildAnimations(localPlayer.sprite, newAnims);

    // Sincroniza com o servidor (que retransmitirá para os outros)
    socket.emit('player:update', { gender: localGender });
  }

  /**
   * Cria o Container de um jogador: AnimatedSprite + label de nome.
   *
   * O (0,0) do container representa a posição dos pés do personagem.
   * O AnimatedSprite tem anchor (0.5, 0.9) — 90% da altura fica acima do (0,0).
   * Isso garante que mover o container pelo X/Y posiciona os pés no mapa.
   *
   * Armazena em container._anim, container._anims e container._curAnim
   * para permitir troca de animação via setAnimation().
   */
  function createPlayerSprite(animations, name, isLocal, color) {
    const container = new PIXI.Container();

    // ── AnimatedSprite ───────────────────────────────────────────────────────
    const initialTextures = animations.idle || animations.walk_down;
    const anim = new PIXI.AnimatedSprite(initialTextures);

    // (0.5, 0.9): centro horizontal, pés no origin do container
    anim.anchor.set(0.5, 0.9);
    anim.scale.set(SPRITE_SCALE);
    anim.animationSpeed = 0.05; // começa como idle (lento)
    anim.loop = true;
    anim.play();

    // No modo atlas, 'tint' colore o sprite com a cor do jogador
    if (useAtlas) anim.tint = color;

    // Referências usadas por setAnimation()
    container._anim    = anim;
    container._anims   = animations;
    container._curAnim = 'idle';

    container.addChild(anim);

    // ── Label de nome ────────────────────────────────────────────────────────
    const nameLabel = new PIXI.Text(name, {
      fontSize:           11,
      fill:               0xffffff,
      fontFamily:         'Courier New, monospace',
      fontWeight:         isLocal ? 'bold' : 'normal',
      dropShadow:         true,
      dropShadowColor:    0x000000,
      dropShadowBlur:     3,
      dropShadowDistance: 1,
    });
    nameLabel.anchor.set(0.5, 1); // centralizado, base do texto encosta no topo do sprite
    nameLabel.y = LABEL_Y;
    container.addChild(nameLabel);

    // ── Indicador "você" ─────────────────────────────────────────────────────
    if (isLocal) {
      const arrow = new PIXI.Text('▼', {
        fontSize:           11,
        fill:               0xffd700,
        dropShadow:         true,
        dropShadowColor:    0x000000,
        dropShadowDistance: 1,
      });
      arrow.anchor.set(0.5, 0);
      arrow.y = 4; // logo abaixo dos pés
      container.addChild(arrow);
    }

    return container;
  }

  /**
   * Troca a animação ativa de um container de personagem.
   *
   * Acessa container._anim (o AnimatedSprite interno) e substitui
   * container._anim.textures pelo array da nova animação.
   * Não reinicia se a animação já for a mesma (evita flickering).
   *
   * @param {PIXI.Container} container
   * @param {string}         animName  ex: 'idle', 'walk_down', 'walk_left'
   */
  function setAnimation(container, animName) {
    if (container._curAnim === animName) return; // sem mudança

    const anim  = container._anim;
    const anims = container._anims;
    if (!anim || !anims) return;

    const textures = anims[animName] || anims.idle;
    if (!textures || textures.length === 0) return;

    // Troca o array de texturas e reinicia no frame 0
    anim.textures       = textures;
    anim.animationSpeed = animName === 'idle' ? 0.05 : 0.15;
    anim.gotoAndPlay(0);

    container._curAnim = animName;
  }

  function updatePlayerCount(n) {
    document.querySelector('#player-count strong').textContent = n;
  }

  // Liga o botão de gênero (definido no index.html) à função toggleGender
  document.getElementById('gender-btn').addEventListener('click', toggleGender);

  // ─── Funções de mapa ───────────────────────────────────────────────────────
  //  (inalteradas em relação à versão anterior)

  function drawMap(layer, width, height) {
    const TILE = 64;
    for (let row = 0; row < Math.ceil(height / TILE); row++) {
      for (let col = 0; col < Math.ceil(width / TILE); col++) {
        const g = new PIXI.Graphics();
        g.beginFill((row + col) % 2 === 0 ? 0x2d5a27 : 0x336629);
        g.drawRect(col * TILE, row * TILE, TILE, TILE);
        g.endFill();
        layer.addChild(g);
      }
    }

    drawLake(layer, MAP_WIDTH / 2, MAP_HEIGHT / 2, 90, 60);

    const trees = [
      { x: 120, y: 100 }, { x: 300, y: 80  }, { x: 500, y: 130 },
      { x: 750, y: 90  }, { x: 950, y: 120 }, { x: 1100, y: 80 },
      { x: 80,  y: 300 }, { x: 180, y: 550 }, { x: 350, y: 680 },
      { x: 900, y: 650 }, { x: 1080, y: 500 }, { x: 1120, y: 680 },
      { x: 60,  y: 700 }, { x: 1150, y: 280 },
    ];
    trees.forEach(({ x, y }) => drawTree(layer, x, y));
    drawPath(layer);

    const border = new PIXI.Graphics();
    border.lineStyle(4, 0x1a3a15, 1);
    border.drawRect(0, 0, width, height);
    layer.addChild(border);
  }

  function drawTree(layer, x, y) {
    const trunk = new PIXI.Graphics();
    trunk.beginFill(0x6b3a2a);
    trunk.drawRect(x - 5, y + 8, 10, 18);
    trunk.endFill();
    layer.addChild(trunk);

    const canopy = new PIXI.Graphics();
    canopy.beginFill(0x1e6b1e);
    canopy.drawCircle(x, y, 28);
    canopy.endFill();
    layer.addChild(canopy);

    const canopy2 = new PIXI.Graphics();
    canopy2.beginFill(0x228b22);
    canopy2.drawCircle(x - 5, y - 5, 20);
    canopy2.endFill();
    layer.addChild(canopy2);
  }

  function drawLake(layer, cx, cy, rx, ry) {
    const water = new PIXI.Graphics();
    water.beginFill(0x1e90ff, 0.8);
    water.drawEllipse(cx, cy, rx, ry);
    water.endFill();
    layer.addChild(water);

    const reflection = new PIXI.Graphics();
    reflection.beginFill(0x87ceeb, 0.4);
    reflection.drawEllipse(cx - 15, cy - 15, rx * 0.5, ry * 0.4);
    reflection.endFill();
    layer.addChild(reflection);

    const border = new PIXI.Graphics();
    border.lineStyle(3, 0x1565c0, 0.7);
    border.drawEllipse(cx, cy, rx, ry);
    layer.addChild(border);
  }

  function drawPath(layer) {
    for (let x = 200; x < 1000; x += 24) {
      if (Math.abs(x - MAP_WIDTH / 2) < 110) continue;
      const stone = new PIXI.Graphics();
      stone.beginFill(0x9e9e9e, 0.7);
      const w = 18 + Math.random() * 8;
      const h = 14 + Math.random() * 6;
      stone.drawRoundedRect(x, MAP_HEIGHT / 2 - h / 2 + (Math.random() - 0.5) * 10, w, h, 4);
      stone.endFill();
      layer.addChild(stone);
    }
  }

})();
