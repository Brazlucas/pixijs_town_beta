// ============================================================
//  main.js — Entry point: orquestra todos os módulos
//
//  Dependências (carregadas via <script> antes deste arquivo):
//    GameConfig, InputManager, Camera, WelcomeManager,
//    PlayerFactory, OfficeMap, Actions, Hud, VoiceManager,
//    GatherSprites, PIXI, io (Socket.io)
// ============================================================
(async function () {
  'use strict';

  const C = window.GameConfig;

  // ─── 1. Perfil do jogador ─────────────────────────────────────────────────
  let profile = WelcomeManager.loadProfile();
  if (!profile) {
    profile = await WelcomeManager.showWelcomeModal();
    WelcomeManager.saveProfile(profile);
  } else {
    WelcomeManager.hideWelcomeModal();
  }

  // ─── 2. PixiJS ────────────────────────────────────────────────────────────
  PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

  const app = new PIXI.Application({
    width:           C.VIEWPORT_W,
    height:          C.VIEWPORT_H,
    backgroundColor: 0x1a1a2e,
    antialias:       false,
    resolution:      window.devicePixelRatio || 1,
    autoDensity:     true,
  });
  document.getElementById('game-canvas-wrapper').appendChild(app.view);

  // ─── 3. World layers ─────────────────────────────────────────────────────
  const world          = new PIXI.Container();
  const mapLayer       = new PIXI.Container();
  const furnitureLayer = new PIXI.Container();
  const areaLayer      = new PIXI.Container();
  const playerLayer    = new PIXI.Container();
  world.addChild(mapLayer, furnitureLayer, areaLayer, playerLayer);
  app.stage.addChild(world);

  // ─── 4. Módulos ───────────────────────────────────────────────────────────
  const camera = new Camera(world, C.VIEWPORT_W, C.VIEWPORT_H);
  const input  = new InputManager();

  let sharedAnimations = null, useAtlas = false;
  try {
    const sheet      = await PIXI.Assets.load('assets/player.json');
    sharedAnimations = sheet.animations;
    useAtlas         = true;
  } catch (_) {}

  // ─── 5. Rede ──────────────────────────────────────────────────────────────
  const socket       = io();
  const voiceManager = new VoiceManager(socket);

  let localPlayer      = null;
  const remotePlayers  = new Map();
  let lastSendTime     = 0;
  let localDirection   = 'idle';
  let rooms = [], desks = [];
  let mapW = 3200, mapH = 2400;
  let currentVoiceZone = null;
  let actionCooldown   = 0;

  // Helpers locais (atalhos que usam estado do closure)
  const getAnims = (color, gender) =>
    PlayerFactory.getAnimations(app, color, gender, useAtlas, sharedAnimations);

  // ─── 6. Socket Events ────────────────────────────────────────────────────

  socket.on('init', ({ self, players, rooms: r, desks: d, mapWidth, mapHeight }) => {
    mapW = mapWidth; mapH = mapHeight;
    rooms = r; desks = d;
    camera.setMapSize(mapW, mapH);

    OfficeMap.draw(mapLayer, furnitureLayer, mapW, mapH, rooms, desks);
    OfficeMap.drawDeskAreas(areaLayer, desks, socket.id);

    self.name = profile.name;
    self.gender = profile.gender;
    socket.emit('player:update', { name: profile.name, gender: profile.gender });

    Hud.setPlayerName(profile.name);
    Hud.updatePlayerCount(players.length + 1);

    localPlayer = {
      data:   { ...self, direction: 'idle' },
      sprite: PlayerFactory.createSprite(getAnims(self.color, profile.gender), profile.name, true, self.color, useAtlas),
    };
    localPlayer.sprite.x = self.x;
    localPlayer.sprite.y = self.y;
    playerLayer.addChild(localPlayer.sprite);
    PlayerFactory.setAnimation(localPlayer.sprite, 'idle');

    players.forEach(addRemote);
  });

  socket.on('player:joined', (data) => {
    addRemote(data);
    Hud.updatePlayerCount(remotePlayers.size + 1);
  });

  socket.on('player:moved', ({ id, x, y, direction }) => {
    const r = remotePlayers.get(id);
    if (!r) return;
    r.targetX = x; r.targetY = y;
    if (r.direction !== direction) {
      r.direction = direction;
      PlayerFactory.setAnimation(r.sprite, direction);
    }
  });

  socket.on('player:updated', ({ id, gender, name }) => {
    const r = remotePlayers.get(id);
    if (!r) return;
    if (gender) { r.gender = gender; PlayerFactory.rebuildAnimations(r.sprite, getAnims(r.color, gender)); }
    if (name)   { r.name = name; PlayerFactory.updateNameLabel(r.sprite, name); }
  });

  socket.on('player:left', (id) => {
    const r = remotePlayers.get(id);
    if (r) { playerLayer.removeChild(r.sprite); r.sprite.destroy({ children: true }); remotePlayers.delete(id); }
    Hud.updatePlayerCount(remotePlayers.size + 1);
  });

  socket.on('player:action', ({ id, action }) => {
    const r = remotePlayers.get(id);
    if (r) Actions.showBubble(app, r.sprite, action);
  });

  socket.on('desk:updated', (newDesks) => {
    desks = newDesks;
    OfficeMap.drawDeskAreas(areaLayer, desks, socket.id);
  });

  socket.on('voice:status', ({ id, active }) => {
    const r = remotePlayers.get(id);
    if (r) Actions.updateVoiceIndicator(r.sprite, active);
  });

  // ─── 7. Game Loop ─────────────────────────────────────────────────────────

  app.ticker.add((delta) => {
    if (!localPlayer) return;

    // ── Input & Movimento ─────────────────────────────────────────────────
    let moved = false, newDir = null;
    if (input.isDown('ArrowUp')    || input.isDown('KeyW')) { localPlayer.data.y -= C.PLAYER_SPEED; moved = true; newDir = 'walk_up'; }
    if (input.isDown('ArrowDown')  || input.isDown('KeyS')) { localPlayer.data.y += C.PLAYER_SPEED; moved = true; newDir = 'walk_down'; }
    if (input.isDown('ArrowLeft')  || input.isDown('KeyA')) { localPlayer.data.x -= C.PLAYER_SPEED; moved = true; newDir = 'walk_left'; }
    if (input.isDown('ArrowRight') || input.isDown('KeyD')) { localPlayer.data.x += C.PLAYER_SPEED; moved = true; newDir = 'walk_right'; }

    localPlayer.data.x = Math.max(24, Math.min(mapW - 24, localPlayer.data.x));
    localPlayer.data.y = Math.max(24, Math.min(mapH - 24, localPlayer.data.y));
    localPlayer.sprite.x = localPlayer.data.x;
    localPlayer.sprite.y = localPlayer.data.y;

    const targetAnim = moved ? newDir : 'idle';
    if (targetAnim !== localDirection) {
      localDirection = targetAnim;
      PlayerFactory.setAnimation(localPlayer.sprite, localDirection);
    }

    // ── Envio de posição ──────────────────────────────────────────────────
    if (moved) {
      const now = Date.now();
      if (now - lastSendTime >= C.SEND_MS) {
        socket.emit('player:move', { x: localPlayer.data.x, y: localPlayer.data.y, direction: localDirection });
        lastSendTime = now;
      }
    }

    // ── Interpolação remota ───────────────────────────────────────────────
    remotePlayers.forEach(r => {
      r.sprite.x += (r.targetX - r.sprite.x) * C.LERP_FACTOR;
      r.sprite.y += (r.targetY - r.sprite.y) * C.LERP_FACTOR;
    });

    // ── Depth sort + Câmera ───────────────────────────────────────────────
    playerLayer.children.sort((a, b) => a.y - b.y);
    camera.follow(localPlayer.data.x, localPlayer.data.y);

    // ── Voice zone ────────────────────────────────────────────────────────
    const zone = Actions.detectVoiceZone(localPlayer.data.x, localPlayer.data.y, rooms, desks);
    if (zone !== currentVoiceZone) {
      if (currentVoiceZone) voiceManager.leaveRoom();
      currentVoiceZone = zone;
      if (zone) voiceManager.joinRoom(zone);
      Hud.setVoiceActive(!!zone);
    }

    // ── Cooldown + speaking ───────────────────────────────────────────────
    if (actionCooldown > 0) actionCooldown -= delta;
    if (voiceManager.currentRoom) {
      Actions.updateVoiceIndicator(localPlayer.sprite, true, voiceManager.isSpeaking());
    }
  });

  // ─── 8. Atalhos e HUD ────────────────────────────────────────────────────

  function triggerCoffee() {
    if (!localPlayer || actionCooldown > 0) return;
    actionCooldown = 180;
    Actions.showBubble(app, localPlayer.sprite, 'coffee');
    socket.emit('player:action', { action: 'coffee' });
  }

  function triggerClaim() {
    if (!localPlayer) return;
    const half = C.DESK_AREA / 2;
    const px = localPlayer.data.x, py = localPlayer.data.y;
    for (const desk of desks) {
      if (Math.abs(px - desk.x) < half && Math.abs(py - desk.y) < half) {
        if (!desk.ownerId || desk.ownerId === socket.id) {
          socket.emit('desk:claim', { deskId: desk.id });
          return;
        }
      }
    }
  }

  Hud.bindButtons({
    onCoffee: triggerCoffee,
    onClaim:  triggerClaim,
    onMute:   () => Hud.setMuteState(voiceManager.toggleMute()),
  });

  input.onKeyDown(e => {
    if (e.code === 'KeyE') triggerCoffee();
    if (e.code === 'KeyC') triggerClaim();
  });

  // ─── 9. Helpers ───────────────────────────────────────────────────────────

  function addRemote(data) {
    if (remotePlayers.has(data.id)) return;
    const anims  = getAnims(data.color, data.gender);
    const sprite = PlayerFactory.createSprite(anims, data.name, false, data.color, useAtlas);
    sprite.x = data.x;
    sprite.y = data.y;
    playerLayer.addChild(sprite);
    PlayerFactory.setAnimation(sprite, data.direction || 'idle');
    remotePlayers.set(data.id, {
      sprite, targetX: data.x, targetY: data.y,
      direction: data.direction || 'idle',
      color: data.color, gender: data.gender || 'male', name: data.name,
    });
  }

})();
