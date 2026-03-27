// ============================================================
//  server/state.js — Estado global e helpers de gerenciamento
// ============================================================

const { PLAYER_COLORS } = require('./config');

/** @type {Map<string, Object>} socketId → player data */
const players = new Map();

/** @type {Map<string, Set<string>>} roomId → Set<socketId> */
const voiceRooms = new Map();

function randomColor() {
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

/**
 * Remove um socket de todas as salas de voz e notifica os peers.
 */
function leaveAllVoiceRooms(io, socketId) {
  voiceRooms.forEach((room, roomId) => {
    if (!room.has(socketId)) return;
    room.delete(socketId);
    room.forEach(pid => io.to(pid).emit('voice:peer-left', { peerId: socketId }));
    io.emit('voice:status', { id: socketId, roomId, active: false });
    if (room.size === 0) voiceRooms.delete(roomId);
  });
}

/**
 * Libera todas as mesas reservadas por um socket e notifica todos.
 */
function releasePlayerDesks(io, socketId, desks) {
  let changed = false;
  desks.forEach(d => {
    if (d.ownerId === socketId) {
      d.ownerId = null;
      d.ownerName = '';
      changed = true;
    }
  });
  if (changed) io.emit('desk:updated', desks);
}

module.exports = { players, voiceRooms, randomColor, leaveAllVoiceRooms, releasePlayerDesks };
