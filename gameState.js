const config = require('./gameConfig');

const players = new Map();
const npcs = new Map();
const bullets = new Map();
const eventHandlers = {
  onPlayerHit: () => {},
  onPlayerDeath: () => {}
};

let bulletIdCounter = 0;
let npcIdCounter = 0;

function nowMs() {
  return Date.now();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalizeVector(x, y) {
  const len = Math.hypot(x, y);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return { x: x / len, y: y / len };
}

function circleIntersectsRect(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

function canPlaceCircle(x, y, radius) {
  if (x - radius < 0 || x + radius > config.world.width) return false;
  if (y - radius < 0 || y + radius > config.world.height) return false;

  const tempCircle = { x, y, radius };
  for (const obstacle of config.arena.obstacles) {
    if (circleIntersectsRect(tempCircle, obstacle)) return false;
  }

  return true;
}

function spawnAtValidPoint(radius) {
  // Sempre al centro della mappa come richiesto dall'utente
  return {
    x: config.world.width / 2,
    y: config.world.height / 2
  };
}

function getCharacterType(typeId) {
  return config.characterTypes[typeId] || {};
}

function createPlayer(id, nickname) {
  const spawn = spawnAtValidPoint(config.player.radius);
  const ts = nowMs();
  const typeId = config.characterTypeIds.player;
  const type = getCharacterType(typeId);

  return {
    id,
    typeId,
    sprite: type.sprite || null,
    nickname: nickname || `Player-${id.slice(0, 4)}`,
    x: spawn.x,
    y: spawn.y,
    radius: config.player.radius,
    maxHp: config.player.maxHp,
    hp: config.player.maxHp,
    angle: 0,
    score: 0,
    kills: 0,
    deaths: 0,
    alive: true,
    respawnAt: 0,
    lastShotAt: ts,
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      interact: false,
      aimAngle: 0
    }
  };
}

function createNpc() {
  const spawn = spawnAtValidPoint(config.npc.radius);
  const id = `npc-${npcIdCounter++}`;
  const typeId = config.characterTypeIds.npc;
  const type = getCharacterType(typeId);

  return {
    id,
    typeId,
    sprite: type.sprite || null,
    x: spawn.x,
    y: spawn.y,
    radius: config.npc.radius,
    maxHp: config.npc.maxHp,
    hp: config.npc.maxHp,
    angle: 0,
    lastShotAt: nowMs(),
    targetId: null
  };
}

function createBullet({ ownerId, sourceType, x, y, angle, speed, damage, lifeMs, radius, sprite }) {
  const id = `b-${bulletIdCounter++}`;
  const dir = normalizeVector(Math.cos(angle), Math.sin(angle));

  bullets.set(id, {
    id,
    ownerId,
    sourceType,
    x,
    y,
    radius: radius ?? 5,
    sprite: sprite || null,
    vx: dir.x * speed,
    vy: dir.y * speed,
    damage,
    expiresAt: nowMs() + lifeMs
  });
}

function moveCircleWithCollisions(entity, targetX, targetY) {
  const radius = entity.radius;

  const stepX = clamp(targetX, radius, config.world.width - radius);
  if (canPlaceCircle(stepX, entity.y, radius)) {
    entity.x = stepX;
  }

  const stepY = clamp(targetY, radius, config.world.height - radius);
  if (canPlaceCircle(entity.x, stepY, radius)) {
    entity.y = stepY;
  }
}

function damagePlayer(player, amount, attackerId) {
  if (!player.alive) return;

  player.hp = Math.max(0, player.hp - amount);
  eventHandlers.onPlayerHit({
    playerId: player.id,
    damage: amount,
    hp: player.hp,
    maxHp: player.maxHp
  });

  if (player.hp > 0) return;

  player.alive = false;
  player.respawnAt = nowMs() + config.player.respawnDelayMs;
  player.deaths += 1;

  const attacker = players.get(attackerId);
  if (attacker && attacker.id !== player.id) {
    attacker.score += 1;
    attacker.kills += 1;
  }

  eventHandlers.onPlayerDeath({
    playerId: player.id,
    playerName: player.nickname,
    attackerId,
    attackerName: attacker ? attacker.nickname : 'NPC',
    attackerType: attacker ? 'player' : 'npc',
    respawnAt: player.respawnAt
  });
}

function damageNpc(npc, amount, attackerId) {
  npc.hp = Math.max(0, npc.hp - amount);
  if (npc.hp > 0) return;

  npcs.delete(npc.id);

  const attacker = players.get(attackerId);
  if (attacker) {
    attacker.score += config.npc.scoreValue;
  }

  // Rimpiazzo immediato per mantenere la densita' didattica costante.
  const replacement = createNpc();
  npcs.set(replacement.id, replacement);
}

function handlePlayerRespawn(player) {
  if (player.alive || player.respawnAt === 0 || nowMs() < player.respawnAt) return;

  const spawn = spawnAtValidPoint(player.radius);
  player.x = spawn.x;
  player.y = spawn.y;
  player.hp = player.maxHp;
  player.alive = true;
  player.respawnAt = 0;
}

function updatePlayers(deltaSec) {
  const timestamp = nowMs();

  for (const player of players.values()) {
    if (!player.alive) {
      handlePlayerRespawn(player);
      continue;
    }

    const xAxis = Number(player.input.right) - Number(player.input.left);
    const yAxis = Number(player.input.down) - Number(player.input.up);
    const normalized = normalizeVector(xAxis, yAxis);

    const targetX = player.x + normalized.x * config.player.speed * deltaSec;
    const targetY = player.y + normalized.y * config.player.speed * deltaSec;
    moveCircleWithCollisions(player, targetX, targetY);

    player.angle = player.input.aimAngle;
  }
}

function getNearestAlivePlayer(fromX, fromY, range) {
  let bestPlayer = null;
  let bestDistanceSq = range * range;

  for (const player of players.values()) {
    if (!player.alive) continue;

    const d2 = distanceSquared({ x: fromX, y: fromY }, player);
    if (d2 < bestDistanceSq) {
      bestDistanceSq = d2;
      bestPlayer = player;
    }
  }

  return bestPlayer;
}

function updateNpcs(deltaSec) {
  const timestamp = nowMs();

  for (const npc of npcs.values()) {
    const target = getNearestAlivePlayer(npc.x, npc.y, config.npc.aggroRange);
    if (!target) continue;

    const dx = target.x - npc.x;
    const dy = target.y - npc.y;
    const dir = normalizeVector(dx, dy);

    npc.angle = Math.atan2(dy, dx);

    const desiredDistance = 220;
    const currentDistance = Math.hypot(dx, dy);
    if (currentDistance > desiredDistance) {
      const targetX = npc.x + dir.x * config.npc.speed * deltaSec;
      const targetY = npc.y + dir.y * config.npc.speed * deltaSec;
      moveCircleWithCollisions(npc, targetX, targetY);
    }

    const canShoot = timestamp - npc.lastShotAt >= config.npc.shootCooldownMs;
    if (canShoot) {
      npc.lastShotAt = timestamp;
      createBullet({
        ownerId: npc.id,
        sourceType: 'npc',
        x: npc.x,
        y: npc.y,
        angle: npc.angle,
        speed: config.npc.bulletSpeed,
        damage: config.npc.bulletDamage,
        lifeMs: config.npc.bulletLifeMs,
        radius: config.npc.bulletRadius,
        sprite: config.npc.bulletSprite
      });
    }
  }
}

function updateBullets(deltaSec) {
  const now = nowMs();

  for (const bullet of bullets.values()) {
    if (now > bullet.expiresAt) {
      bullets.delete(bullet.id);
      continue;
    }

    bullet.x += bullet.vx * deltaSec;
    bullet.y += bullet.vy * deltaSec;

    if (
      bullet.x < 0 ||
      bullet.x > config.world.width ||
      bullet.y < 0 ||
      bullet.y > config.world.height
    ) {
      bullets.delete(bullet.id);
      continue;
    }

    let hitObstacle = false;
    for (const obstacle of config.arena.obstacles) {
      if (circleIntersectsRect(bullet, obstacle)) {
        hitObstacle = true;
        break;
      }
    }

    if (hitObstacle) {
      bullets.delete(bullet.id);
      continue;
    }

    if (bullet.sourceType === 'player') {
      for (const npc of npcs.values()) {
        const rr = bullet.radius + npc.radius;
        const d2 = distanceSquared(bullet, npc);
        if (d2 <= rr * rr) {
          damageNpc(npc, bullet.damage, bullet.ownerId);
          bullets.delete(bullet.id);
          break;
        }
      }
      if (!bullets.has(bullet.id)) continue;

      for (const player of players.values()) {
        if (!player.alive || player.id === bullet.ownerId) continue;

        const rr = bullet.radius + player.radius;
        const d2 = distanceSquared(bullet, player);
        if (d2 <= rr * rr) {
          damagePlayer(player, bullet.damage, bullet.ownerId);
          bullets.delete(bullet.id);
          break;
        }
      }
      continue;
    }

    for (const player of players.values()) {
      if (!player.alive) continue;

      const rr = bullet.radius + player.radius;
      const d2 = distanceSquared(bullet, player);
      if (d2 <= rr * rr) {
        damagePlayer(player, bullet.damage, bullet.ownerId);
        bullets.delete(bullet.id);
        break;
      }
    }
  }
}

function sanitizeAngle(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function setPlayerInput(playerId, input) {
  const player = players.get(playerId);
  if (!player) return;

  player.input.up = Boolean(input.up);
  player.input.down = Boolean(input.down);
  player.input.left = Boolean(input.left);
  player.input.right = Boolean(input.right);
  player.input.interact = Boolean(input.interact);
  player.input.aimAngle = sanitizeAngle(input.aimAngle);
}

function addPlayer(id, nickname) {
  const player = createPlayer(id, String(nickname || '').slice(0, 18).trim());
  players.set(id, player);
  return player;
}

function removePlayer(id) {
  players.delete(id);
}

function initNpcs() {
  npcs.clear();
  for (let i = 0; i < config.npc.count; i += 1) {
    const npc = createNpc();
    npcs.set(npc.id, npc);
  }
}

function tick(deltaSec) {
  updatePlayers(deltaSec);
  updateNpcs(deltaSec);
  updateBullets(deltaSec);
}

function serializeState() {
  return {
    timestamp: nowMs(),
    map: config.map,
    mapVisuals: config.map.visuals,
    world: config.world,
    obstacles: config.arena.obstacles,
    players: Array.from(players.values()).map((p) => ({
      id: p.id,
      typeId: p.typeId,
      sprite: p.sprite,
      nickname: p.nickname,
      x: p.x,
      y: p.y,
      radius: p.radius,
      hp: p.hp,
      maxHp: p.maxHp,
      angle: p.angle,
      score: p.score,
      kills: p.kills,
      deaths: p.deaths,
      alive: p.alive,
      respawnAt: p.respawnAt
    })),
    npcs: Array.from(npcs.values()).map((n) => ({
      id: n.id,
      typeId: n.typeId,
      sprite: n.sprite,
      x: n.x,
      y: n.y,
      radius: n.radius,
      hp: n.hp,
      maxHp: n.maxHp,
      angle: n.angle
    })),
    bullets: Array.from(bullets.values()).map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      radius: b.radius,
      sprite: b.sprite,
      sourceType: b.sourceType
    }))
  };
}

module.exports = {
  config,
  setEventHandlers,
  addPlayer,
  removePlayer,
  setPlayerInput,
  initNpcs,
  tick,
  serializeState
};

function setEventHandlers(handlers = {}) {
  if (typeof handlers.onPlayerHit === 'function') {
    eventHandlers.onPlayerHit = handlers.onPlayerHit;
  }
  if (typeof handlers.onPlayerDeath === 'function') {
    eventHandlers.onPlayerDeath = handlers.onPlayerDeath;
  }
}
