// ============================================================
//  server/handlers.js — Socket event handlers
// ============================================================

const { MAP_WIDTH, MAP_HEIGHT, ROOMS, DESKS } = require('./config');
const { players, voiceRooms, randomColor, leaveAllVoiceRooms, releasePlayerDesks } = require('./state');

/**
 * Registra todos os handlers de socket para um novo jogador conectado.
 */
function registerHandlers(io, socket) {
  console.log(`[+] Jogador conectado: ${socket.id}`);

  const newPlayer = {
    id:        socket.id,
    x:         MAP_WIDTH / 2 + (Math.random() - 0.5) * 200,
    y:         MAP_HEIGHT / 2 + (Math.random() - 0.5) * 200,
    color:     randomColor(),
    name:      'Anônimo',
    direction: 'idle',
    gender:    'male',
  };
  players.set(socket.id, newPlayer);

  socket.emit('init', {
    self:      newPlayer,
    players:   Array.from(players.values()).filter(p => p.id !== socket.id),
    rooms:     ROOMS,
    desks:     DESKS,
    mapWidth:  MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
  });
  socket.broadcast.emit('player:joined', newPlayer);

  registerMovementHandlers(io, socket);
  registerProfileHandlers(io, socket);
  registerActionHandlers(io, socket);
  registerDeskHandlers(io, socket);
  registerVoiceHandlers(io, socket);
  registerDisconnectHandler(io, socket);
}

// ─── Movement ───────────────────────────────────────────────────────────────

function registerMovementHandlers(io, socket) {
  socket.on('player:move', (data) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.x         = Math.max(16, Math.min(MAP_WIDTH  - 16, data.x));
    p.y         = Math.max(16, Math.min(MAP_HEIGHT - 16, data.y));
    p.direction = data.direction || 'idle';
    socket.broadcast.emit('player:moved', {
      id: socket.id, x: p.x, y: p.y, direction: p.direction,
    });
  });
}

// ─── Profile ────────────────────────────────────────────────────────────────

function registerProfileHandlers(io, socket) {
  socket.on('player:update', (data) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (data.gender === 'male' || data.gender === 'female') p.gender = data.gender;
    if (data.name && typeof data.name === 'string') p.name = data.name.substring(0, 20);
    socket.broadcast.emit('player:updated', { id: socket.id, gender: p.gender, name: p.name });
  });
}

// ─── Actions ────────────────────────────────────────────────────────────────

function registerActionHandlers(io, socket) {
  socket.on('player:action', (data) => {
    socket.broadcast.emit('player:action', { id: socket.id, action: data.action });
  });
}

// ─── Desk Claiming ──────────────────────────────────────────────────────────

function registerDeskHandlers(io, socket) {
  socket.on('desk:claim', ({ deskId }) => {
    const p = players.get(socket.id);
    if (!p) return;
    const desk = DESKS.find(d => d.id === deskId);
    if (!desk || (desk.ownerId && desk.ownerId !== socket.id)) return;

    // Libera mesa anterior do jogador
    DESKS.forEach(d => {
      if (d.ownerId === socket.id) { d.ownerId = null; d.ownerName = ''; }
    });
    desk.ownerId   = socket.id;
    desk.ownerName = p.name;
    io.emit('desk:updated', DESKS);
  });

  socket.on('desk:release', () => {
    releasePlayerDesks(io, socket.id, DESKS);
  });
}

// ─── Voice Signaling ────────────────────────────────────────────────────────

function registerVoiceHandlers(io, socket) {
  socket.on('voice:join-room', ({ roomId }) => {
    if (!voiceRooms.has(roomId)) voiceRooms.set(roomId, new Set());
    const room = voiceRooms.get(roomId);
    room.forEach(pid => io.to(pid).emit('voice:peer-joined', { peerId: socket.id, roomId }));
    socket.emit('voice:room-peers', { roomId, peers: Array.from(room) });
    room.add(socket.id);
    io.emit('voice:status', { id: socket.id, roomId, active: true });
  });

  socket.on('voice:leave-room', ({ roomId }) => {
    const room = voiceRooms.get(roomId);
    if (!room) return;
    room.delete(socket.id);
    room.forEach(pid => io.to(pid).emit('voice:peer-left', { peerId: socket.id }));
    io.emit('voice:status', { id: socket.id, roomId, active: false });
    if (room.size === 0) voiceRooms.delete(roomId);
  });

  socket.on('voice:offer',         ({ to, offer })     => io.to(to).emit('voice:offer',         { from: socket.id, offer }));
  socket.on('voice:answer',        ({ to, answer })    => io.to(to).emit('voice:answer',        { from: socket.id, answer }));
  socket.on('voice:ice-candidate', ({ to, candidate }) => io.to(to).emit('voice:ice-candidate', { from: socket.id, candidate }));
}

// ─── Disconnect ─────────────────────────────────────────────────────────────

function registerDisconnectHandler(io, socket) {
  socket.on('disconnect', () => {
    console.log(`[-] Jogador desconectado: ${socket.id}`);
    leaveAllVoiceRooms(io, socket.id);
    releasePlayerDesks(io, socket.id, DESKS);
    players.delete(socket.id);
    io.emit('player:left', socket.id);
  });
}

module.exports = { registerHandlers };
