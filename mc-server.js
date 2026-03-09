// Mini Craft Multiplayer Server
// Node.js + Socket.io — deploy to Railway, Render, or Fly.io

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── World State ─────────────────────────────────────────────────────────────
const W = 56;
const world = {}; // "x,y,z" => blockIndex

function key(x, y, z) { return `${x},${y},${z}`; }

function noise(x, z) {
  return Math.round(
    Math.sin(x * 0.3 + 1.7) * Math.cos(z * 0.25 + 0.9) * 2 +
    Math.sin(x * 0.13 + z * 0.19) * 3 +
    Math.sin(x * 0.07 - z * 0.11) * 4
  );
}

// Generate world on startup
const WATER_IDX = 9;
for (let x = -W / 2; x < W / 2; x++) {
  for (let z = -W / 2; z < W / 2; z++) {
    const h = noise(x, z);
    world[key(x, h, z)] = 0; // grass
    for (let y = h - 1; y >= h - 3; y--) world[key(x, y, z)] = 1; // dirt
    for (let y = h - 4; y >= -10; y--) world[key(x, y, z)] = 2; // stone
    if (h < -1) for (let y = h + 1; y <= -1; y++) world[key(x, y, z)] = WATER_IDX;
    if (Math.random() < 0.022 && h > -1) {
      for (let ty = 1; ty <= 4; ty++) world[key(x, h + ty, z)] = 3;
      for (let lx = -2; lx <= 2; lx++)
        for (let lz = -2; lz <= 2; lz++)
          for (let ly = 3; ly <= 5; ly++)
            if (!world[key(x + lx, h + ly, z + lz)])
              world[key(x + lx, h + ly, z + lz)] = 0;
    }
  }
}

// ─── Players ─────────────────────────────────────────────────────────────────
const players = {}; // id => { id, name, pos, yaw, pitch, color }
const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e8c'];
let colorIdx = 0;

// ─── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`Player connected: ${socket.id}`);

  const spawnH = noise(0, 0);
  const player = {
    id: socket.id,
    name: 'Player' + (Object.keys(players).length + 1),
    pos: { x: Math.random() * 4 - 2, y: spawnH + 3, z: Math.random() * 4 - 2 },
    yaw: 0, pitch: 0,
    color: COLORS[colorIdx++ % COLORS.length],
  };
  players[socket.id] = player;

  // Send world + existing players to new joiner
  socket.emit('init', { world, players, self: player });

  // Notify others of new player
  socket.broadcast.emit('playerJoined', player);

  // Player moves
  socket.on('move', data => {
    if (!players[socket.id]) return;
    players[socket.id].pos = data.pos;
    players[socket.id].yaw = data.yaw;
    players[socket.id].pitch = data.pitch;
    socket.broadcast.emit('playerMoved', { id: socket.id, pos: data.pos, yaw: data.yaw, pitch: data.pitch });
  });

  // Block change (break or place)
  socket.on('blockChange', ({ x, y, z, blockIdx }) => {
    const k = key(x, y, z);
    if (blockIdx === -1) delete world[k];
    else world[k] = blockIdx;
    socket.broadcast.emit('blockChanged', { x, y, z, blockIdx });
  });

  // Chat
  socket.on('chat', msg => {
    const p = players[socket.id];
    if (!p || !msg || msg.length > 200) return;
    const payload = { name: p.name, color: p.color, msg: msg.slice(0, 200) };
    io.emit('chat', payload);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Mini Craft server running on port ${PORT}`));
