const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve os arquivos estáticos do cliente
app.use(express.static(path.join(__dirname, 'client')));

// ─── Estado Global do Jogo ─────────────────────────────────────────────────────
// Map de id do socket -> dados do jogador
const players = new Map();

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 800;

// Paleta de cores para os avatares
const PLAYER_COLORS = [
  0xff6b6b, // vermelho suave
  0x4ecdc4, // teal
  0x45b7d1, // azul claro
  0x96ceb4, // verde suave
  0xffeaa7, // amarelo
  0xdda0dd, // lilás
  0xff9f43, // laranja
  0xa29bfe, // roxo
];

function randomColor() {
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

function randomName() {
  const adjectives = ['Rápido', 'Azul', 'Neon', 'Ninja', 'Pixel', 'Turbo', 'Cyber'];
  const nouns = ['Pato', 'Raposa', 'Lobo', 'Urso', 'Gato', 'Panda', 'Tigre'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}`;
}

// ─── Gerenciamento de Conexões ─────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Jogador conectado: ${socket.id}`);

  // Cria os dados iniciais do novo jogador com posição aleatória no mapa
  const newPlayer = {
    id:        socket.id,
    x:         Math.random() * (MAP_WIDTH - 200) + 100,
    y:         Math.random() * (MAP_HEIGHT - 200) + 100,
    color:     randomColor(),
    name:      randomName(),
    direction: 'idle',
    gender:    'male',  // padrão — o cliente pode alterar via player:update
  };

  players.set(socket.id, newPlayer);

  // Envia para o próprio jogador: seus dados + lista de todos os outros já conectados
  socket.emit('init', {
    self: newPlayer,
    players: Array.from(players.values()).filter((p) => p.id !== socket.id),
  });

  // Notifica TODOS os outros jogadores que alguém novo entrou
  socket.broadcast.emit('player:joined', newPlayer);

  // ─── Evento: Jogador se moveu ──────────────────────────────────────────────
  socket.on('player:move', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    // Validação e clamping server-side para evitar cheating / posições inválidas
    player.x         = Math.max(16, Math.min(MAP_WIDTH  - 16, data.x));
    player.y         = Math.max(16, Math.min(MAP_HEIGHT - 16, data.y));
    player.direction = data.direction || 'idle'; // persiste para jogadores que conectarem depois

    // Retransmite posição + direção para TODOS os outros clientes
    // (não para quem enviou, pois ele já atualizou localmente)
    socket.broadcast.emit('player:moved', {
      id:        socket.id,
      x:         player.x,
      y:         player.y,
      direction: player.direction,
    });
  });

  // ─── Evento: Atualização de propriedades (gênero, etc.) ───────────────────
  socket.on('player:update', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    if (data.gender === 'male' || data.gender === 'female') {
      player.gender = data.gender;
    }

    // Retransmite para os outros clientes atualizarem o sprite
    socket.broadcast.emit('player:updated', { id: socket.id, gender: player.gender });
  });

  // ─── Evento: Desconexão ────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Jogador desconectado: ${socket.id}`);
    players.delete(socket.id);

    // Avisa todos para remover o avatar desse jogador
    io.emit('player:left', socket.id);
  });
});

// ─── Inicia o servidor ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🟢 Servidor rodando em http://localhost:${PORT}\n`);
});
