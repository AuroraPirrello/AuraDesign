const path = require('path');
const fsSync = require('fs');
const fs = require('fs/promises');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
require('dotenv').config({ quiet: true });

const {
  config,
  setEventHandlers,
  addPlayer,
  removePlayer,
  setPlayerInput,
  initNpcs,
  tick,
  serializeState
} = require('./gameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const MAPS_FILE = path.join(__dirname, 'maps.json');
const MAP_EDITOR_ENABLED = process.env.MAP_EDITOR_ENABLED !== 'false';

fsSync.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
      const originalExt = path.extname(file.originalname || '').toLowerCase();
      const safeExt = originalExt && originalExt.length <= 8 ? originalExt : '';
      const token = crypto.randomBytes(6).toString('hex');
      const fileName = `map-${Date.now()}-${token}${safeExt || '.png'}`;
      cb(null, fileName);
    }
  }),
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      cb(new Error('File non valido: carica solo immagini'));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.use(express.static(PUBLIC_DIR));
app.use(express.json({ limit: '1mb' }));

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-fA-F]{6})$/.test(value.trim());
}

function isValidRgbaColor(value) {
  if (typeof value !== 'string') return false;
  const cleaned = value.trim().replace(/\s+/g, '');
  if (cleaned.toLowerCase() === 'transparent') return true;
  return /^rgba?\(\d{1,3},\d{1,3},\d{1,3}(,[0-9]*\.?[0-9]+)?\)$/i.test(cleaned);
}

function sanitizeOptionalAssetPath(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} non valido: usare stringa percorso asset`);
  }
  const trimmed = value.trim();
  if (trimmed.length > 500) {
    throw new Error(`${fieldName} non valido: stringa troppo lunga`);
  }
  return trimmed;
}

function sanitizeObstacle(rawObstacle, world) {
  if (!rawObstacle || typeof rawObstacle !== 'object') return null;

  const rawX = Number(rawObstacle.x);
  const rawY = Number(rawObstacle.y);
  const rawWidth = Number(rawObstacle.width);
  const rawHeight = Number(rawObstacle.height);

  if (![rawX, rawY, rawWidth, rawHeight].every(isFiniteNumber)) return null;
  if (rawWidth <= 0 || rawHeight <= 0) return null;

  const clampedX = Math.max(0, Math.min(rawX, world.width));
  const clampedY = Math.max(0, Math.min(rawY, world.height));
  const maxWidth = Math.max(0, world.width - clampedX);
  const maxHeight = Math.max(0, world.height - clampedY);
  const clampedWidth = Math.min(rawWidth, maxWidth);
  const clampedHeight = Math.min(rawHeight, maxHeight);

  if (clampedWidth < 2 || clampedHeight < 2) return null;

  const sanitized = {
    x: Math.round(clampedX),
    y: Math.round(clampedY),
    width: Math.round(clampedWidth),
    height: Math.round(clampedHeight)
  };

  if (rawObstacle.fillColor !== undefined) {
    if (!isValidHexColor(rawObstacle.fillColor) && !isValidRgbaColor(rawObstacle.fillColor)) {
      return null;
    }
    sanitized.fillColor = rawObstacle.fillColor.trim();
  }

  if (rawObstacle.strokeColor !== undefined) {
    if (!isValidHexColor(rawObstacle.strokeColor) && !isValidRgbaColor(rawObstacle.strokeColor)) {
      return null;
    }
    sanitized.strokeColor = rawObstacle.strokeColor.trim();
  }

  if (rawObstacle.fillAlpha !== undefined) {
    const fillAlpha = Number(rawObstacle.fillAlpha);
    if (!Number.isFinite(fillAlpha) || fillAlpha < 0 || fillAlpha > 1) {
      return null;
    }
    sanitized.fillAlpha = Number(fillAlpha.toFixed(2));
  }

  if (rawObstacle.texture !== undefined) {
    const texture = sanitizeOptionalAssetPath(rawObstacle.texture, 'obstacle.texture');
    if (texture) {
      sanitized.texture = texture;
    }
  }
  
  if (rawObstacle.isInteraction !== undefined) {
    sanitized.isInteraction = Boolean(rawObstacle.isInteraction);
    if (rawObstacle.interactionText !== undefined) {
      if (Array.isArray(rawObstacle.interactionText)) {
        sanitized.interactionText = rawObstacle.interactionText
          .map(t => String(t).trim())
          .filter(t => t.length > 0)
          .map(t => t.length > 200 ? t.slice(0, 200) : t);
      } else {
        const text = String(rawObstacle.interactionText).trim();
        sanitized.interactionText = text.length > 200 ? text.slice(0, 200) : text;
      }
    }
    if (rawObstacle.interactionType !== undefined) {
      sanitized.interactionType = rawObstacle.interactionType === 'click' ? 'click' : 'proximity';
    }
  }

  if (rawObstacle.id !== undefined) {
    sanitized.id = String(rawObstacle.id).trim().slice(0, 50);
  }

  if (rawObstacle.isWinBlocker !== undefined) {
    sanitized.isWinBlocker = Boolean(rawObstacle.isWinBlocker);
  }

  if (rawObstacle.usePassword !== undefined) {
    sanitized.usePassword = Boolean(rawObstacle.usePassword);
    sanitized.correctPassword = String(rawObstacle.correctPassword || '').trim().slice(0, 50);
    sanitized.unlockTargetId = String(rawObstacle.unlockTargetId || '').trim().slice(0, 50);
  }

  return sanitized;
}

async function persistMaps(nextMaps) {
  const previousMapsContent = await fs.readFile(MAPS_FILE, 'utf8');
  const nextMapsContent = `${JSON.stringify(nextMaps, null, 2)}\n`;
  await fs.writeFile(`${MAPS_FILE}.bak`, previousMapsContent, 'utf8');
  await fs.writeFile(`${MAPS_FILE}.tmp`, nextMapsContent, 'utf8');
  await fs.rename(`${MAPS_FILE}.tmp`, MAPS_FILE);
}

function sanitizeVisuals(rawVisuals, currentVisuals = {}) {
  if (!rawVisuals || typeof rawVisuals !== 'object') {
    return currentVisuals;
  }

  const nextVisuals = { ...currentVisuals };

  if (rawVisuals.obstacleStroke !== undefined) {
    if (!isValidHexColor(rawVisuals.obstacleStroke)) {
      throw new Error('obstacleStroke non valido: usare formato #RRGGBB');
    }
    nextVisuals.obstacleStroke = rawVisuals.obstacleStroke.trim().toLowerCase();
  }

  if (rawVisuals.obstacleColor !== undefined) {
    if (!isValidHexColor(rawVisuals.obstacleColor) && !isValidRgbaColor(rawVisuals.obstacleColor)) {
      throw new Error('obstacleColor non valido: usare #RRGGBB o rgba(...)');
    }
    nextVisuals.obstacleColor = rawVisuals.obstacleColor.trim();
  }

  if (rawVisuals.obstacleFillAlpha !== undefined) {
    const alpha = Number(rawVisuals.obstacleFillAlpha);
    if (!Number.isFinite(alpha) || alpha < 0.1 || alpha > 1) {
      throw new Error('obstacleFillAlpha non valido: usare numero tra 0.1 e 1');
    }
    nextVisuals.obstacleFillAlpha = Number(alpha.toFixed(2));
  }

  if (rawVisuals.clearColor !== undefined) {
    if (!isValidHexColor(rawVisuals.clearColor) && !isValidRgbaColor(rawVisuals.clearColor)) {
      throw new Error('clearColor non valido: usare #RRGGBB o rgba(...)');
    }
    nextVisuals.clearColor = rawVisuals.clearColor.trim();
  }

  if (rawVisuals.gridColor !== undefined) {
    if (!isValidHexColor(rawVisuals.gridColor) && !isValidRgbaColor(rawVisuals.gridColor)) {
      throw new Error('gridColor non valido: usare #RRGGBB o rgba(...)');
    }
    nextVisuals.gridColor = rawVisuals.gridColor.trim();
  }

  if (rawVisuals.backgroundSprite !== undefined) {
    nextVisuals.backgroundSprite = sanitizeOptionalAssetPath(
      rawVisuals.backgroundSprite,
      'backgroundSprite'
    );
  }

  if (rawVisuals.backgroundTileSize !== undefined) {
    const tileSize = Number(rawVisuals.backgroundTileSize);
    if (!Number.isFinite(tileSize) || tileSize < 32 || tileSize > 4096) {
      throw new Error('backgroundTileSize non valido: usare numero tra 32 e 4096');
    }
    nextVisuals.backgroundTileSize = Math.round(tileSize);
  }

  if (rawVisuals.backgroundMode !== undefined) {
    const mode = String(rawVisuals.backgroundMode);
    if (mode !== 'tile' && mode !== 'coverWorld') {
      throw new Error('backgroundMode non valido: usare \"tile\" o \"coverWorld\"');
    }
    nextVisuals.backgroundMode = mode;
  }

  if (rawVisuals.obstacleSprite !== undefined) {
    nextVisuals.obstacleSprite = sanitizeOptionalAssetPath(rawVisuals.obstacleSprite, 'obstacleSprite');
  }

  return nextVisuals;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

if (MAP_EDITOR_ENABLED) {
  app.post('/api/uploads', (req, res) => {
    upload.single('image')(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'File troppo grande: massimo 10MB' });
          return;
        }
        res.status(400).json({ error: error.message || 'Upload non riuscito' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Nessun file ricevuto' });
        return;
      }

      res.json({
        ok: true,
        path: `/uploads/${req.file.filename}`
      });
    });
  });

  app.get('/map-editor', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'map-editor.html'));
  });

  app.get('/api/maps', (_req, res) => {
    const summaries = Object.entries(config.maps).map(([id, map]) => ({
      id,
      name: map.name || id,
      world: map.world || { width: config.world.width, height: config.world.height },
      obstaclesCount: Array.isArray(map.obstacles) ? map.obstacles.length : 0
    }));

    res.json({
      activeMapId: config.map.id,
      maps: summaries
    });
  });

  app.get('/api/maps/:mapId', (req, res) => {
    const { mapId } = req.params;
    const map = config.maps[mapId];
    if (!map) {
      res.status(404).json({ error: `Map "${mapId}" non trovata` });
      return;
    }

    res.json({
      id: mapId,
      map
    });
  });

  app.put('/api/maps/:mapId', async (req, res) => {
    try {
      const { mapId } = req.params;
      const targetMap = config.maps[mapId];
      if (!targetMap) {
        res.status(404).json({ error: `Map "${mapId}" non trovata` });
        return;
      }

      const world = targetMap.world || { width: config.world.width, height: config.world.height };
      const rawObstacles = req.body?.obstacles;
      if (!Array.isArray(rawObstacles)) {
        res.status(400).json({ error: 'Payload non valido: obstacles deve essere un array' });
        return;
      }
      if (rawObstacles.length > 2000) {
        res.status(400).json({ error: 'Troppi ostacoli: massimo 2000' });
        return;
      }

      const obstacles = rawObstacles
        .map((obstacle) => sanitizeObstacle(obstacle, world))
        .filter(Boolean);
      const visuals = sanitizeVisuals(req.body?.visuals, targetMap.visuals || {});

      const mapsFromDisk = JSON.parse(await fs.readFile(MAPS_FILE, 'utf8'));
      if (!mapsFromDisk[mapId]) {
        res.status(404).json({ error: `Map "${mapId}" non trovata nel file maps.json` });
        return;
      }

      mapsFromDisk[mapId].obstacles = obstacles;
      mapsFromDisk[mapId].visuals = visuals;
      await persistMaps(mapsFromDisk);

      targetMap.obstacles = obstacles;
      targetMap.visuals = visuals;
      if (config.map.id === mapId) {
        config.arena.obstacles = obstacles;
        config.map.visuals = visuals;
      }

      res.json({
        ok: true,
        mapId,
        savedObstacles: obstacles.length
      });
    } catch (error) {
      console.error('map-editor save error:', error);
      const isValidationError =
        error instanceof Error &&
        /non valido|massimo|array|formato|numero|stringa/i.test(error.message || '');
      res.status(isValidationError ? 400 : 500).json({
        error: isValidationError ? error.message : 'Errore durante il salvataggio mappa'
      });
    }
  });
}

initNpcs();
setEventHandlers({
  onPlayerHit: ({ playerId, damage, hp, maxHp }) => {
    const socket = io.sockets.sockets.get(playerId);
    if (!socket) return;
    socket.emit('playerHit', { damage, hp, maxHp });
  },
  onPlayerDeath: ({ playerId, playerName, attackerName, attackerType, respawnAt }) => {
    const socket = io.sockets.sockets.get(playerId);
    if (socket) {
      socket.emit('playerDeath', { attackerName, attackerType, respawnAt });
    }

    io.emit('killFeed', `${attackerName} eliminated ${playerName}`);
  }
});

io.on('connection', (socket) => {
  let hasJoined = false;

  socket.on('join', (payload = {}) => {
    if (hasJoined) return;

    const nickname = String(payload.nickname || '').trim() || `Player-${socket.id.slice(0, 4)}`;
    const player = addPlayer(socket.id, nickname);
    hasJoined = true;

    socket.emit('joined', {
      playerId: player.id,
      world: config.world,
      map: config.map,
      tickRate: config.tickRate,
      themeHint: 'Puoi personalizzare look via server/maps.json (map.visuals) oppure public/js/theme.js'
    });

    socket.broadcast.emit('systemMessage', `${player.nickname} joined`);
  });

  socket.on('input', (input = {}) => {
    if (!hasJoined) return;
    setPlayerInput(socket.id, input);
  });

  socket.on('disconnect', () => {
    if (!hasJoined) return;
    removePlayer(socket.id);
  });

  socket.on('unlockObstacle', (payload = {}) => {
    if (!hasJoined) return;
    const { targetId } = payload;
    if (!targetId) return;

    const obstacles = config.arena.obstacles;
    const index = obstacles.findIndex(o => o.id === targetId);
    
    if (index !== -1) {
      const obstacle = obstacles[index];
      obstacles.splice(index, 1);
      
      // Store removed blocker info for win condition detection on client
      io.emit('obstacleUnlocked', { 
        targetId, 
        rect: { x: obstacle.x, y: obstacle.y, width: obstacle.width, height: obstacle.height },
        isWinBlocker: !!obstacle.isWinBlocker
      });
    }
  });
});

const tickIntervalMs = 1000 / config.tickRate;
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const deltaSec = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;
  tick(deltaSec);
}, tickIntervalMs);

const broadcastIntervalMs = 1000 / config.stateBroadcastRate;
setInterval(() => {
  io.emit('state', serializeState());
}, broadcastIntervalMs);

server.listen(PORT, () => {
  // Messaggio utile in aula per sapere dove collegarsi.
  console.log(`multiplayer-arena-shooter server listening on http://localhost:${PORT}`);
});
