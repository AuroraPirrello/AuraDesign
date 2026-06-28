import { visualConfig as v } from './theme.js';

const spriteCache = new Map();

function getSpriteRecord(src) {
  if (!src) return null;
  if (spriteCache.has(src)) return spriteCache.get(src);

  const image = new Image();
  const record = { image, ready: false };
  image.onload = () => {
    record.ready = true;
  };
  image.onerror = () => {
    record.ready = false;
  };
  image.src = src;
  spriteCache.set(src, record);
  return record;
}

function getRenderVisuals(state) {
  const merged = { ...v, ...(state?.mapVisuals || {}) };
  const parsedGridSize = Number(merged.gridSize);
  merged.gridSize = Number.isFinite(parsedGridSize) && parsedGridSize > 0 ? parsedGridSize : v.gridSize;
  return merged;
}

function drawBackground(ctx, camera, canvas, world, visuals) {
  const bgSprite = getSpriteRecord(visuals.backgroundSprite);
  if (bgSprite && bgSprite.ready) {
    const mode = visuals.backgroundMode || 'coverWorld';
    if (mode === 'coverWorld') {
      ctx.drawImage(bgSprite.image, -camera.x, -camera.y, world.width, world.height);
      return;
    }

    const tileSize = visuals.backgroundTileSize || 512;
    const startX = -((camera.x % tileSize) + tileSize) % tileSize;
    const startY = -((camera.y % tileSize) + tileSize) % tileSize;

    for (let x = startX - tileSize; x < canvas.width + tileSize; x += tileSize) {
      for (let y = startY - tileSize; y < canvas.height + tileSize; y += tileSize) {
        ctx.drawImage(bgSprite.image, x, y, tileSize, tileSize);
      }
    }
    return;
  }

  ctx.fillStyle = visuals.clearColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGrid(ctx, camera, canvas, world, visuals) {
  const size = visuals.gridSize;
  const startX = Math.floor(camera.x / size) * size;
  const startY = Math.floor(camera.y / size) * size;
  const endX = camera.x + canvas.width;
  const endY = camera.y + canvas.height;

  ctx.strokeStyle = visuals.gridColor;
  ctx.lineWidth = 1;

  for (let x = startX; x <= endX; x += size) {
    ctx.beginPath();
    ctx.moveTo(x - camera.x, 0);
    ctx.lineTo(x - camera.x, canvas.height);
    ctx.stroke();
  }

  for (let y = startY; y <= endY; y += size) {
    ctx.beginPath();
    ctx.moveTo(0, y - camera.y);
    ctx.lineTo(canvas.width, y - camera.y);
    ctx.stroke();
  }

  ctx.strokeStyle = visuals.worldBorderColor || 'rgba(255,255,255,0.2)';
  ctx.strokeRect(-camera.x, -camera.y, world.width, world.height);
}

function drawObstacles(ctx, camera, obstacles, visuals) {
  for (const o of obstacles) {
    const x = o.x - camera.x;
    const y = o.y - camera.y;
    const obstacleSprite = getSpriteRecord(o.texture || visuals.obstacleSprite);
    const fillStyle = o.fillColor || visuals.obstacleColor;
    const strokeStyle = o.strokeColor || visuals.obstacleStroke;
    const fillAlpha = Number.isFinite(Number(o.fillAlpha))
      ? Math.max(0, Math.min(1, Number(o.fillAlpha)))
      : Number.isFinite(Number(visuals.obstacleFillAlpha))
        ? Math.max(0, Math.min(1, Number(visuals.obstacleFillAlpha)))
        : 1;

    ctx.lineWidth = 2;
    if (obstacleSprite && obstacleSprite.ready) {
      ctx.drawImage(obstacleSprite.image, x, y, o.width, o.height);
    } else {
      ctx.save();
      ctx.globalAlpha = fillAlpha;
      ctx.fillStyle = fillStyle;
      ctx.fillRect(x, y, o.width, o.height);
      ctx.restore();
    }
    
    if (strokeStyle !== 'transparent') {
      ctx.strokeStyle = strokeStyle;
      ctx.strokeRect(x, y, o.width, o.height);
    }
  }
}

function drawHpBar(ctx, x, y, width, hp, maxHp, visuals) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y, width, 5);
  ctx.fillStyle = ratio > 0.4 ? visuals.hpGood : visuals.hpBad;
  ctx.fillRect(x, y, width * ratio, 5);
}

function drawCharacter(ctx, camera, entity, bodyColor, gunColor, labelText, visuals, options = {}) {
  const x = entity.x - camera.x;
  const y = entity.y - camera.y;
  const spriteRecord = options.useSprite ? getSpriteRecord(options.spriteSrc) : null;
  const useSprite = Boolean(spriteRecord && spriteRecord.ready);
  const spriteScale = options.spriteScale || 2.6;

  ctx.save();
  ctx.translate(x, y);

  if (useSprite) {
    const scaleX = options.spriteScaleX || options.spriteScale || 2.6;
    const scaleY = options.spriteScaleY || options.spriteScale || 2.6;
    const width = entity.radius * scaleX;
    const height = entity.radius * scaleY;

    if (!options.skipRotation) {
      // +PI/2: molti sprite "guardano" verso l'alto di default.
      ctx.rotate((entity.angle || 0) + Math.PI / 2);
    }
    
    if (entity.facingRight === true) {
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(spriteRecord.image, -width / 2, -height / 2, width, height);
  } else {
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(0, 0, entity.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(entity.angle || 0);
    ctx.fillStyle = gunColor;
    ctx.fillRect(8, -3, entity.radius + 12, 6);
  }
  ctx.restore();

  if (labelText) {
    ctx.fillStyle = visuals.nickname;
    ctx.font = '12px Trebuchet MS, Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labelText, x, y - entity.radius - 12);
  }
}

export function renderGame(ctx, canvas, gameView) {
  const { state, selfPlayerId, camera } = gameView;
  if (!state) return;
  const visuals = getRenderVisuals(state);

  drawBackground(ctx, camera, canvas, state.world, visuals);

  drawGrid(ctx, camera, canvas, state.world, visuals);
  drawObstacles(ctx, camera, state.obstacles, visuals);

  for (const player of state.players) {
    if (player.id !== selfPlayerId) continue;
    
    const bodyColor = player.alive ? visuals.playerBody : visuals.playerDead;
    drawCharacter(
      ctx,
      camera,
      player,
      bodyColor,
      visuals.playerGun,
      null,
      visuals,
      {
        useSprite: true,
        spriteSrc: player.sprite,
        spriteScaleX: 6,
        spriteScaleY: 10,
        skipRotation: true
      }
    );
  }


}
