// ============================================================
//  server/config.js — Constantes e definições de layout do mapa
// ============================================================

const MAP_WIDTH  = 3200;
const MAP_HEIGHT = 2400;

const PLAYER_COLORS = [
  0xff6b6b, 0x4ecdc4, 0x45b7d1, 0x96ceb4,
  0xffeaa7, 0xdda0dd, 0xff9f43, 0xa29bfe,
];

const ROOMS = [
  { id: 'room-alpha', name: 'Sala Alpha', x: 128,  y: 128, w: 512, h: 448 },
  { id: 'room-beta',  name: 'Sala Beta',  x: 832,  y: 128, w: 512, h: 448 },
  { id: 'room-gamma', name: 'Sala Gamma', x: 1536, y: 128, w: 512, h: 448 },
];

const DESKS = [
  { id: 'desk-1',  x: 384,  y: 920  },
  { id: 'desk-2',  x: 768,  y: 920  },
  { id: 'desk-3',  x: 1152, y: 920  },
  { id: 'desk-4',  x: 1536, y: 920  },
  { id: 'desk-5',  x: 1920, y: 920  },
  { id: 'desk-6',  x: 384,  y: 1380 },
  { id: 'desk-7',  x: 768,  y: 1380 },
  { id: 'desk-8',  x: 1152, y: 1380 },
  { id: 'desk-9',  x: 1536, y: 1380 },
  { id: 'desk-10', x: 1920, y: 1380 },
].map(d => ({ ...d, ownerId: null, ownerName: '' }));

module.exports = { MAP_WIDTH, MAP_HEIGHT, PLAYER_COLORS, ROOMS, DESKS };
