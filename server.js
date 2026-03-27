// ============================================================
//  server.js — Entry point do servidor
// ============================================================

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const { registerHandlers } = require('./server/handlers');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'client')));

io.on('connection', (socket) => registerHandlers(io, socket));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n🟢 Servidor rodando em http://localhost:${PORT}\n`));
