const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');
const canvasWrap = document.getElementById('canvasWrap');
const mapSelect = document.getElementById('mapSelect');
const snapInput = document.getElementById('snapInput');
const fillColorInput = document.getElementById('fillColorInput');
const strokeColorInput = document.getElementById('strokeColorInput');
const transparentStrokeCheck = document.getElementById('transparentStrokeCheck');
const fillAlphaInput = document.getElementById('fillAlphaInput');
const isInteractionCheck = document.getElementById('isInteractionCheck');
const interactionTextGroup = document.getElementById('interactionTextGroup');
const interactionTextInput = document.getElementById('interactionTextInput');
const interactionTypeGroup = document.getElementById('interactionTypeGroup');
const interactionTypeSelect = document.getElementById('interactionTypeSelect');
const obstacleTextureInput = document.getElementById('obstacleTextureInput');
const obstacleTextureLabel = document.getElementById('obstacleTextureLabel');
const clearObstacleTextureBtn = document.getElementById('clearObstacleTextureBtn');
const applyToSelectedBtn = document.getElementById('applyToSelectedBtn');
const clearSelectedStyleBtn = document.getElementById('clearSelectedStyleBtn');
const clearColorInput = document.getElementById('clearColorInput');
const backgroundSpriteInput = document.getElementById('backgroundSpriteInput');
const backgroundTextureLabel = document.getElementById('backgroundTextureLabel');
const clearBackgroundTextureBtn = document.getElementById('clearBackgroundTextureBtn');
const backgroundTileSizeInput = document.getElementById('backgroundTileSizeInput');
const backgroundModeInput = document.getElementById('backgroundModeInput');
const defaultObstacleTextureInput = document.getElementById('defaultObstacleTextureInput');
const defaultObstacleTextureLabel = document.getElementById('defaultObstacleTextureLabel');
const clearDefaultObstacleTextureBtn = document.getElementById('clearDefaultObstacleTextureBtn');
const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const reloadBtn = document.getElementById('reloadBtn');
const saveBtn = document.getElementById('saveBtn');
const statsEl = document.getElementById('stats');
const statusEl = document.getElementById('status');
const contextMenu = document.getElementById('contextMenu');
const ctxDeleteSelectedBtn = document.getElementById('ctxDeleteSelectedBtn');
const ctxDeleteClickedBtn = document.getElementById('ctxDeleteClickedBtn');
const ctxBringToFrontBtn = document.getElementById('ctxBringToFrontBtn');
const ctxSendToBackBtn = document.getElementById('ctxSendToBackBtn');
const selectModeRadio = document.getElementById('selectModeRadio');
const drawModeRadio = document.getElementById('drawModeRadio');
const obstacleIdInput = document.getElementById('obstacleIdInput');
const isWinBlockerCheck = document.getElementById('isWinBlockerCheck');
const usePasswordCheck = document.getElementById('usePasswordCheck');
const passwordFields = document.getElementById('passwordFields');
const correctPasswordInput = document.getElementById('correctPasswordInput');
const unlockTargetIdInput = document.getElementById('unlockTargetIdInput');

const DEFAULTS = {
  obstacleColor: '#4a5568',
  obstacleStroke: 'transparent',
  obstacleFillAlpha: 0.86,
  clearColor: '#161b22',
  backgroundTileSize: 512
};

const spriteCache = new Map();

const state = {
  activeMapId: null,
  mapMeta: [],
  map: null,
  obstacles: [],
  undoStack: [],
  selectedObstacleIndexes: new Set(),
  contextTargetIndex: -1,
  draftStart: null,
  draftEnd: null,
  drag: null,
  scale: 1,
  viewOffsetX: 0,
  viewOffsetY: 0,
  selectedTexturePath: null
};

function getSpriteRecord(src) {
  if (!src) return null;
  if (spriteCache.has(src)) return spriteCache.get(src);

  const image = new Image();
  const record = { image, ready: false };
  image.onload = () => {
    record.ready = true;
    draw();
  };
  image.onerror = () => {
    record.ready = false;
  };
  image.src = src;
  spriteCache.set(src, record);
  return record;
}

async function fetchJsonOrThrow(url, options) {
  const response = await fetch(url, options);
  const rawBody = await response.text();
  let payload = null;

  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    const apiMessage = payload && typeof payload.error === 'string' ? payload.error : null;
    const fallback =
      `HTTP ${response.status} su ${url}. Controlla di essere sul server Node (porta API), non sul client dev server.`;
    throw new Error(apiMessage || fallback);
  }

  if (!payload) {
    throw new Error(`Risposta non JSON da ${url}. Verifica endpoint e porta.`);
  }

  return payload;
}

function setStatus(message, type = 'ok') {
  statusEl.textContent = message;
  statusEl.className = type;
}

function basename(pathValue) {
  if (!pathValue || typeof pathValue !== 'string') return '';
  const parts = pathValue.split('/');
  return parts[parts.length - 1] || pathValue;
}

function updateTextureLabels() {
  const selectedRef = getSelectionReferenceObstacle();
  const selectedTexture = state.selectedTexturePath || selectedRef?.texture || '';
  obstacleTextureLabel.textContent = selectedTexture
    ? `Texture selezionati: ${basename(selectedTexture)}`
    : 'Nessuna texture selezionata';

  const backgroundTexture = state.map?.visuals?.backgroundSprite || '';
  backgroundTextureLabel.textContent = backgroundTexture
    ? `Background: ${basename(backgroundTexture)}`
    : 'Nessuna texture background';

  const defaultObstacleTexture = state.map?.visuals?.obstacleSprite || '';
  defaultObstacleTextureLabel.textContent = defaultObstacleTexture
    ? `Default obstacle: ${basename(defaultObstacleTexture)}`
    : 'Nessuna texture default obstacle';
}

async function uploadImageFile(file) {
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('File non valido: carica solo immagini');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File troppo grande: massimo 10MB');
  }

  const formData = new FormData();
  formData.append('image', file);

  const payload = await fetchJsonOrThrow('/api/uploads', {
    method: 'POST',
    body: formData
  });

  if (!payload.path) {
    throw new Error('Upload completato ma path non ricevuto');
  }

  return payload.path;
}

function clearStatus() {
  statusEl.textContent = '';
  statusEl.className = '';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cloneObstacles(obstacles) {
  return obstacles.map((o) => ({ ...o }));
}

function pushUndoSnapshot() {
  state.undoStack.push(cloneObstacles(state.obstacles));
  if (state.undoStack.length > 40) state.undoStack.shift();
}

function parseSnap() {
  const value = Number(snapInput.value);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.min(value, 200));
}

function snapValue(v, snap) {
  return Math.round(v / snap) * snap;
}

function normalizeHex(hex) {
  if (typeof hex !== 'string') return null;
  const clean = hex.trim();
  if (!clean.startsWith('#')) return null;
  if (clean.length === 4) {
    const r = clean[1];
    const g = clean[2];
    const b = clean[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (clean.length === 7) return clean.toLowerCase();
  return null;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function parseColorAndAlpha(colorValue, fallbackHex, fallbackAlpha = 1) {
  if (typeof colorValue !== 'string') {
    return { hex: fallbackHex, alpha: fallbackAlpha };
  }

  const normalizedHex = normalizeHex(colorValue);
  if (normalizedHex) {
    return { hex: normalizedHex, alpha: 1 };
  }

  const rgbaMatch = colorValue
    .replace(/\s+/g, '')
    .match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/i);

  if (!rgbaMatch) {
    return { hex: fallbackHex, alpha: fallbackAlpha };
  }

  const r = Number(rgbaMatch[1]);
  const g = Number(rgbaMatch[2]);
  const b = Number(rgbaMatch[3]);
  const a = rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1;

  return {
    hex: rgbToHex(r, g, b),
    alpha: clamp(Number.isFinite(a) ? a : fallbackAlpha, 0.1, 1)
  };
}

function selectedIndexesSorted() {
  return Array.from(state.selectedObstacleIndexes).sort((a, b) => a - b);
}

function setSingleSelection(index) {
  state.selectedObstacleIndexes.clear();
  if (index >= 0) state.selectedObstacleIndexes.add(index);
}

function toggleSelection(index) {
  if (state.selectedObstacleIndexes.has(index)) {
    state.selectedObstacleIndexes.delete(index);
  } else {
    state.selectedObstacleIndexes.add(index);
  }
}

function clearSelection() {
  state.selectedObstacleIndexes.clear();
}

function normalizeRect(a, b, snap, world) {
  const x1 = snapValue(a.x, snap);
  const y1 = snapValue(a.y, snap);
  const x2 = snapValue(b.x, snap);
  const y2 = snapValue(b.y, snap);

  const minX = Math.max(0, Math.min(x1, x2));
  const minY = Math.max(0, Math.min(y1, y2));
  const maxX = Math.min(world.width, Math.max(x1, x2));
  const maxY = Math.min(world.height, Math.max(y1, y2));

  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 2 || height < 2) return null;

  return { x: minX, y: minY, width, height };
}

function computeViewTransform() {
  const world = state.map.world;
  const dpr = window.devicePixelRatio || 1;
  const width = canvasWrap.clientWidth;
  const height = canvasWrap.clientHeight;

  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const scaleX = width / world.width;
  const scaleY = height / world.height;
  state.scale = Math.min(scaleX, scaleY);

  const worldScreenWidth = world.width * state.scale;
  const worldScreenHeight = world.height * state.scale;
  state.viewOffsetX = (width - worldScreenWidth) / 2;
  state.viewOffsetY = (height - worldScreenHeight) / 2;
}

function worldToScreen(point) {
  return {
    x: state.viewOffsetX + point.x * state.scale,
    y: state.viewOffsetY + point.y * state.scale
  };
}

function screenToWorld(point) {
  return {
    x: (point.x - state.viewOffsetX) / state.scale,
    y: (point.y - state.viewOffsetY) / state.scale
  };
}

function inWorld(point) {
  const world = state.map.world;
  return point.x >= 0 && point.y >= 0 && point.x <= world.width && point.y <= world.height;
}

function getMousePosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function findObstacleIndexAt(worldPoint) {
  for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
    const o = state.obstacles[i];
    const inside =
      worldPoint.x >= o.x &&
      worldPoint.x <= o.x + o.width &&
      worldPoint.y >= o.y &&
      worldPoint.y <= o.y + o.height;
    if (inside) return i;
  }
  return -1;
}

function drawGrid(world, gridSize) {
  const actualGrid = Math.max(10, Number(gridSize) || 80);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;

  for (let x = 0; x <= world.width; x += actualGrid) {
    const from = worldToScreen({ x, y: 0 });
    const to = worldToScreen({ x, y: world.height });
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  for (let y = 0; y <= world.height; y += actualGrid) {
    const from = worldToScreen({ x: 0, y });
    const to = worldToScreen({ x: world.width, y });
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

function getObstacleFillStyle(obstacle, visuals) {
  const fillColor = obstacle.fillColor || visuals.obstacleColor || DEFAULTS.obstacleColor;
  const fillAlpha = Number.isFinite(Number(obstacle.fillAlpha))
    ? clamp(Number(obstacle.fillAlpha), 0, 1)
    : Number.isFinite(Number(visuals.obstacleFillAlpha))
      ? clamp(Number(visuals.obstacleFillAlpha), 0, 1)
      : 1;

  const rgb = hexToRgb(fillColor);
  if (rgb) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${fillAlpha.toFixed(2)})`;
  }

  if (/^rgba?\(/i.test(fillColor)) {
    return fillColor;
  }

  return DEFAULTS.obstacleColor;
}

function drawRect(rect, fill, stroke, selected = false) {
  const topLeft = worldToScreen({ x: rect.x, y: rect.y });
  const screenWidth = rect.width * state.scale;
  const screenHeight = rect.height * state.scale;

  ctx.fillStyle = fill;
  ctx.fillRect(topLeft.x, topLeft.y, screenWidth, screenHeight);

  if (stroke !== 'transparent') {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(topLeft.x, topLeft.y, screenWidth, screenHeight);
  } else if (fill === 'rgba(0, 0, 0, 0.00)' || fill === 'transparent') {
    // Helper visual for invisible obstacles in editor
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.strokeRect(topLeft.x, topLeft.y, screenWidth, screenHeight);
    ctx.setLineDash([]);
  }

  if (selected) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.strokeRect(topLeft.x - 1, topLeft.y - 1, screenWidth + 2, screenHeight + 2);
  }

  if (rect.id) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(topLeft.x, topLeft.y - 14, ctx.measureText(rect.id).width + 6, 14);
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.fillText(rect.id, topLeft.x + 3, topLeft.y - 3);
  }
}

function draw() {
  if (!state.map) return;

  const world = state.map.world;
  const visuals = state.map.visuals || {};
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0b1016';
  ctx.fillRect(0, 0, width, height);

  const worldTopLeft = worldToScreen({ x: 0, y: 0 });
  const worldScreenWidth = world.width * state.scale;
  const worldScreenHeight = world.height * state.scale;

  ctx.fillStyle = visuals.clearColor || DEFAULTS.clearColor;
  ctx.fillRect(worldTopLeft.x, worldTopLeft.y, worldScreenWidth, worldScreenHeight);

  const bgSprite = getSpriteRecord(visuals.backgroundSprite);
  if (bgSprite && bgSprite.ready) {
    const bgMode = visuals.backgroundMode || 'coverWorld';
    if (bgMode === 'coverWorld') {
      ctx.drawImage(bgSprite.image, worldTopLeft.x, worldTopLeft.y, worldScreenWidth, worldScreenHeight);
    } else {
      const worldTileSize = Math.max(16, Number(visuals.backgroundTileSize) || DEFAULTS.backgroundTileSize);
      const tileScreenSize = worldTileSize * state.scale;
      if (tileScreenSize > 0) {
        for (let x = worldTopLeft.x; x < worldTopLeft.x + worldScreenWidth; x += tileScreenSize) {
          for (let y = worldTopLeft.y; y < worldTopLeft.y + worldScreenHeight; y += tileScreenSize) {
            ctx.drawImage(bgSprite.image, x, y, tileScreenSize, tileScreenSize);
          }
        }
      }
    }
  }

  drawGrid(world, visuals.gridSize);

  for (let i = 0; i < state.obstacles.length; i += 1) {
    const obstacle = state.obstacles[i];
    const stroke = obstacle.strokeColor || visuals.obstacleStroke || DEFAULTS.obstacleStroke;
    const fill = getObstacleFillStyle(obstacle, visuals);
    const obstacleTexture = getSpriteRecord(obstacle.texture || visuals.obstacleSprite);
    if (obstacleTexture && obstacleTexture.ready) {
      const topLeft = worldToScreen({ x: obstacle.x, y: obstacle.y });
      const screenWidth = obstacle.width * state.scale;
      const screenHeight = obstacle.height * state.scale;
      ctx.drawImage(obstacleTexture.image, topLeft.x, topLeft.y, screenWidth, screenHeight);
      drawRect(obstacle, 'rgba(0,0,0,0)', stroke, state.selectedObstacleIndexes.has(i));
    } else {
      drawRect(obstacle, fill, stroke, state.selectedObstacleIndexes.has(i));
    }

    if (obstacle.isInteraction) {
      const topLeft = worldToScreen({ x: obstacle.x, y: obstacle.y });
      const screenWidth = obstacle.width * state.scale;
      const screenHeight = obstacle.height * state.scale;
      
      const typeLabel = obstacle.interactionType === 'click' ? 'C' : 'P';
      
      ctx.save();
      ctx.strokeStyle = '#3fb983';
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 2;
      ctx.strokeRect(topLeft.x + 2, topLeft.y + 2, screenWidth - 4, screenHeight - 4);
      
      ctx.fillStyle = '#3fb983';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`INT:${typeLabel}`, topLeft.x + screenWidth / 2, topLeft.y + screenHeight / 2 + 5);
      ctx.restore();
    }
  }

  if (state.draftStart && state.draftEnd) {
    const rect = normalizeRect(state.draftStart, state.draftEnd, parseSnap(), world);
    if (rect) {
      drawRect(rect, 'rgba(63,185,131,0.35)', 'rgba(63,185,131,0.95)');
    }
  }

  ctx.strokeStyle = visuals.worldBorderColor || 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(worldTopLeft.x, worldTopLeft.y, worldScreenWidth, worldScreenHeight);

  const selectedCount = state.selectedObstacleIndexes.size;
  statsEl.textContent = [
    `Mappa: ${state.activeMapId}`,
    `World: ${world.width} x ${world.height}`,
    `Obstacles: ${state.obstacles.length}`,
    `Selected: ${selectedCount}`
  ].join(' | ');
}

function hideContextMenu() {
  contextMenu.style.display = 'none';
  state.contextTargetIndex = -1;
}

function showContextMenu(x, y, obstacleIndex) {
  state.contextTargetIndex = obstacleIndex;
  contextMenu.style.display = 'block';
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;

  const rect = contextMenu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - rect.height - 8;
  contextMenu.style.left = `${clamp(x, 8, maxX)}px`;
  contextMenu.style.top = `${clamp(y, 8, maxY)}px`;
}

function getSelectionReferenceObstacle() {
  const selected = selectedIndexesSorted();
  if (selected.length === 0) return null;
  return state.obstacles[selected[0]];
}

function refreshSelectedStyleControls() {
  const visuals = state.map?.visuals || {};
  const selectedRef = getSelectionReferenceObstacle();
  const fillSource = selectedRef?.fillColor || visuals.obstacleColor || DEFAULTS.obstacleColor;
  const strokeSource = selectedRef?.strokeColor || visuals.obstacleStroke || DEFAULTS.obstacleStroke;
  const fillSourceAlpha = selectedRef?.fillAlpha ?? visuals.obstacleFillAlpha ?? DEFAULTS.obstacleFillAlpha;

  const parsedFill = parseColorAndAlpha(fillSource, DEFAULTS.obstacleColor, fillSourceAlpha);
  
  if (strokeSource === 'transparent') {
    transparentStrokeCheck.checked = true;
    strokeColorInput.value = '#2d3748';
  } else {
    transparentStrokeCheck.checked = false;
    const parsedStroke = parseColorAndAlpha(strokeSource, '#2d3748', 1);
    strokeColorInput.value = parsedStroke.hex;
  }

  fillColorInput.value = parsedFill.hex;
  fillAlphaInput.value = String(clamp(Number(fillSourceAlpha) ?? DEFAULTS.obstacleFillAlpha, 0, 1));
  
  isInteractionCheck.checked = !!selectedRef?.isInteraction;
  
  // Handle interactionText as string or array
  const rawText = selectedRef?.interactionText || '';
  interactionTextInput.value = Array.isArray(rawText) ? rawText.join('\n') : rawText;
  
  interactionTypeSelect.value = selectedRef?.interactionType || 'proximity';
  interactionTextGroup.style.display = isInteractionCheck.checked ? 'block' : 'none';
  interactionTypeGroup.style.display = isInteractionCheck.checked ? 'block' : 'none';

  obstacleIdInput.value = selectedRef?.id || '';
  isWinBlockerCheck.checked = !!selectedRef?.isWinBlocker;
  usePasswordCheck.checked = !!selectedRef?.usePassword;
  correctPasswordInput.value = selectedRef?.correctPassword || '';
  unlockTargetIdInput.value = selectedRef?.unlockTargetId || '';
  passwordFields.style.display = usePasswordCheck.checked ? 'block' : 'none';

  state.selectedTexturePath = selectedRef?.texture || null;
  obstacleTextureInput.value = '';
  updateTextureLabels();
}

function applyMapVisualsToInputs(mapVisuals) {
  const clear = parseColorAndAlpha(mapVisuals?.clearColor, DEFAULTS.clearColor, 1);
  clearColorInput.value = clear.hex;
  backgroundSpriteInput.value = '';
  backgroundTileSizeInput.value = String(
    Number.isFinite(Number(mapVisuals?.backgroundTileSize))
      ? Number(mapVisuals.backgroundTileSize)
      : DEFAULTS.backgroundTileSize
  );
  backgroundModeInput.value = mapVisuals?.backgroundMode === 'tile' ? 'tile' : 'coverWorld';
  defaultObstacleTextureInput.value = '';
  updateTextureLabels();
}

function updateBackgroundVisualsFromInputs() {
  if (!state.map) return;

  const existingVisuals = state.map.visuals || {};
  const clearColor = normalizeHex(clearColorInput.value) || DEFAULTS.clearColor;
  const backgroundTileSize = Math.round(clamp(Number(backgroundTileSizeInput.value) || 512, 32, 4096));
  const backgroundMode = backgroundModeInput.value === 'tile' ? 'tile' : 'coverWorld';

  state.map.visuals = {
    ...existingVisuals,
    clearColor,
    backgroundSprite: existingVisuals.backgroundSprite || null,
    backgroundTileSize,
    backgroundMode,
    obstacleSprite: existingVisuals.obstacleSprite || null
  };

  updateTextureLabels();
  draw();
}

function removeObstaclesByIndexes(indexesToRemove) {
  if (!indexesToRemove.length) return;
  const removeSet = new Set(indexesToRemove);
  const next = [];
  for (let i = 0; i < state.obstacles.length; i += 1) {
    if (!removeSet.has(i)) next.push(state.obstacles[i]);
  }
  state.obstacles = next;
  clearSelection();
}

function applyCurrentStyleControlsToSelected({ recordUndo = false } = {}) {
  const selected = selectedIndexesSorted();
  if (!selected.length) return false;

  const fillColor = normalizeHex(fillColorInput.value) || DEFAULTS.obstacleColor;
  const strokeColor = transparentStrokeCheck.checked ? 'transparent' : (normalizeHex(strokeColorInput.value) || DEFAULTS.obstacleStroke);
  const fillAlpha = clamp(Number(fillAlphaInput.value) ?? DEFAULTS.obstacleFillAlpha, 0, 1);
  const texture = state.selectedTexturePath || '';

  if (recordUndo) pushUndoSnapshot();

  for (const index of selected) {
    const obstacle = state.obstacles[index];
    if (!obstacle) continue;
    obstacle.fillColor = fillColor;
    obstacle.strokeColor = strokeColor;
    obstacle.fillAlpha = Number(fillAlpha.toFixed(2));
    if (texture) {
      obstacle.texture = texture;
    } else {
      delete obstacle.texture;
    }

    if (isInteractionCheck.checked) {
      obstacle.isInteraction = true;
      const lines = interactionTextInput.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      obstacle.interactionText = lines.length > 0 ? lines : ['Ti servono tre numeri'];
      obstacle.interactionType = interactionTypeSelect.value;
    } else {
      delete obstacle.isInteraction;
      delete obstacle.interactionText;
      delete obstacle.interactionType;
    }

    obstacle.id = obstacleIdInput.value.trim() || undefined;
    if (!obstacle.id) delete obstacle.id;

    if (isWinBlockerCheck.checked) {
      obstacle.isWinBlocker = true;
    } else {
      delete obstacle.isWinBlocker;
    }

    if (usePasswordCheck.checked) {
      obstacle.usePassword = true;
      obstacle.correctPassword = correctPasswordInput.value.trim();
      obstacle.unlockTargetId = unlockTargetIdInput.value.trim();
      
      // Auto-set interaction if password is used
      obstacle.isInteraction = true;
      if (!obstacle.interactionText || (Array.isArray(obstacle.interactionText) && obstacle.interactionText.length === 0)) {
        obstacle.interactionText = ['Inserisci password'];
      }
      if (!obstacle.interactionType) {
        obstacle.interactionType = 'proximity';
      }
    } else {
      delete obstacle.usePassword;
      delete obstacle.correctPassword;
      delete obstacle.unlockTargetId;
      // Note: we don't delete isInteraction here because the user might want it for other reasons
    }
  }

  draw();
  return true;
}

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (!state.map) return;

  const worldPoint = screenToWorld(getMousePosition(event));
  if (!inWorld(worldPoint)) return;

  const obstacleIndex = findObstacleIndexAt(worldPoint);
  if (obstacleIndex === -1) {
    hideContextMenu();
    return;
  }

  if (!state.selectedObstacleIndexes.has(obstacleIndex)) {
    setSingleSelection(obstacleIndex);
    refreshSelectedStyleControls();
  }

  draw();
  showContextMenu(event.clientX, event.clientY, obstacleIndex);
});

canvas.addEventListener('mousedown', (event) => {
  if (!state.map || event.button !== 0) return;

  hideContextMenu();
  clearStatus();

  const worldPoint = screenToWorld(getMousePosition(event));
  if (!inWorld(worldPoint)) return;

  const isDrawMode = drawModeRadio.checked;
  const obstacleIndex = isDrawMode ? -1 : findObstacleIndexAt(worldPoint);
  const isMultiSelectModifier = event.shiftKey || event.metaKey;

  if (obstacleIndex >= 0) {
    if (isMultiSelectModifier) {
      toggleSelection(obstacleIndex);
      refreshSelectedStyleControls();
      draw();
      return;
    }

    if (!state.selectedObstacleIndexes.has(obstacleIndex)) {
      setSingleSelection(obstacleIndex);
      refreshSelectedStyleControls();
    }

    const selected = selectedIndexesSorted();
    if (selected.length === 0) {
      setSingleSelection(obstacleIndex);
    }

    pushUndoSnapshot();
    const basePositions = selectedIndexesSorted().map((index) => ({
      index,
      x: state.obstacles[index].x,
      y: state.obstacles[index].y,
      width: state.obstacles[index].width,
      height: state.obstacles[index].height
    }));

    state.drag = {
      startWorld: worldPoint,
      basePositions,
      moved: false
    };

    draw();
    return;
  }

  if (!isMultiSelectModifier) {
    clearSelection();
    refreshSelectedStyleControls();
  }

  state.draftStart = worldPoint;
  state.draftEnd = worldPoint;
  draw();
});

window.addEventListener('mousemove', (event) => {
  if (!state.map) return;

  if (state.drag) {
    const world = state.map.world;
    const worldPoint = screenToWorld(getMousePosition(event));
    const snap = parseSnap();

    const dx = snapValue(worldPoint.x - state.drag.startWorld.x, snap);
    const dy = snapValue(worldPoint.y - state.drag.startWorld.y, snap);

    for (const base of state.drag.basePositions) {
      const obstacle = state.obstacles[base.index];
      if (!obstacle) continue;
      obstacle.x = clamp(base.x + dx, 0, world.width - base.width);
      obstacle.y = clamp(base.y + dy, 0, world.height - base.height);
    }

    if (dx !== 0 || dy !== 0) state.drag.moved = true;
    draw();
    return;
  }

  if (!state.draftStart) return;

  const worldPoint = screenToWorld(getMousePosition(event));
  state.draftEnd = {
    x: clamp(worldPoint.x, 0, state.map.world.width),
    y: clamp(worldPoint.y, 0, state.map.world.height)
  };
  draw();
});

window.addEventListener('mouseup', (event) => {
  if (!state.map || event.button !== 0) return;

  if (state.drag) {
    const didMove = state.drag.moved;
    state.drag = null;
    if (didMove) {
      setStatus('Obstacle spostati');
    }
    draw();
    return;
  }

  if (!state.draftStart) return;

  const rect = normalizeRect(state.draftStart, state.draftEnd, parseSnap(), state.map.world);
  state.draftStart = null;
  state.draftEnd = null;

  if (rect) {
    pushUndoSnapshot();
    state.obstacles.push(rect);
    setSingleSelection(state.obstacles.length - 1);
    refreshSelectedStyleControls();
    applyLiveStyleFromControls();
    setStatus('Obstacle aggiunto');
  }

  draw();
});

window.addEventListener('resize', () => {
  if (!state.map) return;
  computeViewTransform();
  draw();
});

window.addEventListener('mousedown', (event) => {
  if (!contextMenu.contains(event.target)) {
    hideContextMenu();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideContextMenu();
  }
});

ctxDeleteClickedBtn.addEventListener('click', () => {
  if (state.contextTargetIndex < 0 || state.contextTargetIndex >= state.obstacles.length) {
    hideContextMenu();
    return;
  }

  pushUndoSnapshot();
  removeObstaclesByIndexes([state.contextTargetIndex]);
  hideContextMenu();
  refreshSelectedStyleControls();
  setStatus('Obstacle eliminato');
  draw();
});

ctxBringToFrontBtn.addEventListener('click', () => {
  const selected = selectedIndexesSorted();
  if (selected.length === 0 && state.contextTargetIndex >= 0) {
    selected.push(state.contextTargetIndex);
  }
  if (selected.length === 0) return;

  pushUndoSnapshot();
  const toMove = selected.map(idx => state.obstacles[idx]);
  const remaining = state.obstacles.filter((_, idx) => !selected.includes(idx));
  state.obstacles = [...remaining, ...toMove];
  
  state.selectedObstacleIndexes.clear();
  for (let i = state.obstacles.length - toMove.length; i < state.obstacles.length; i++) {
    state.selectedObstacleIndexes.add(i);
  }
  
  hideContextMenu();
  setStatus('Portato sopra');
  draw();
});

ctxSendToBackBtn.addEventListener('click', () => {
  const selected = selectedIndexesSorted();
  if (selected.length === 0 && state.contextTargetIndex >= 0) {
    selected.push(state.contextTargetIndex);
  }
  if (selected.length === 0) return;

  pushUndoSnapshot();
  const toMove = selected.map(idx => state.obstacles[idx]);
  const remaining = state.obstacles.filter((_, idx) => !selected.includes(idx));
  state.obstacles = [...toMove, ...remaining];
  
  state.selectedObstacleIndexes.clear();
  for (let i = 0; i < toMove.length; i++) {
    state.selectedObstacleIndexes.add(i);
  }
  
  hideContextMenu();
  setStatus('Portato sotto');
  draw();
});

ctxDeleteSelectedBtn.addEventListener('click', () => {
  const selected = selectedIndexesSorted();
  if (!selected.length) {
    hideContextMenu();
    return;
  }

  pushUndoSnapshot();
  removeObstaclesByIndexes(selected);
  hideContextMenu();
  refreshSelectedStyleControls();
  setStatus(`Eliminati ${selected.length} obstacle`);
  draw();
});

usePasswordCheck.addEventListener('change', () => {
  const isChecked = usePasswordCheck.checked;
  passwordFields.style.display = isChecked ? 'block' : 'none';
  
  if (isChecked && !isInteractionCheck.checked) {
    isInteractionCheck.checked = true;
    interactionTextGroup.style.display = 'block';
    interactionTypeGroup.style.display = 'block';
    if (!interactionTextInput.value.trim()) {
      interactionTextInput.value = 'Inserisci password';
    }
  }
  
  applyLiveStyleFromControls();
});

applyToSelectedBtn.addEventListener('click', () => {
  const applied = applyCurrentStyleControlsToSelected({ recordUndo: true });
  if (!applied) {
    setStatus('Seleziona almeno un obstacle', 'err');
    return;
  }
  setStatus('Stile applicato');
});

clearSelectedStyleBtn.addEventListener('click', () => {
  const selected = selectedIndexesSorted();
  if (!selected.length) {
    setStatus('Seleziona almeno un obstacle', 'err');
    return;
  }

  pushUndoSnapshot();
  for (const index of selected) {
    const obstacle = state.obstacles[index];
    if (!obstacle) continue;
    delete obstacle.fillColor;
    delete obstacle.strokeColor;
    delete obstacle.fillAlpha;
    delete obstacle.texture;
  }

  setStatus(`Stile rimosso da ${selected.length} obstacle`);
  draw();
});

function applyLiveStyleFromControls() {
  const applied = applyCurrentStyleControlsToSelected({ recordUndo: false });
  if (!applied) return;
  clearStatus();
}

fillColorInput.addEventListener('input', applyLiveStyleFromControls);
strokeColorInput.addEventListener('input', applyLiveStyleFromControls);
transparentStrokeCheck.addEventListener('change', applyLiveStyleFromControls);
fillAlphaInput.addEventListener('input', applyLiveStyleFromControls);
obstacleIdInput.addEventListener('input', applyLiveStyleFromControls);
isWinBlockerCheck.addEventListener('change', applyLiveStyleFromControls);
correctPasswordInput.addEventListener('input', applyLiveStyleFromControls);
unlockTargetIdInput.addEventListener('input', applyLiveStyleFromControls);

isInteractionCheck.addEventListener('change', () => {
  const isInt = isInteractionCheck.checked;
  interactionTextGroup.style.display = isInt ? 'block' : 'none';
  interactionTypeGroup.style.display = isInt ? 'block' : 'none';
  applyLiveStyleFromControls();
});
interactionTextInput.addEventListener('input', applyLiveStyleFromControls);
interactionTypeSelect.addEventListener('change', applyLiveStyleFromControls);
obstacleTextureInput.addEventListener('change', async () => {
  const file = obstacleTextureInput.files && obstacleTextureInput.files[0];
  if (!file) return;

  try {
    const uploadedPath = await uploadImageFile(file);
    state.selectedTexturePath = uploadedPath;
    updateTextureLabels();
    applyLiveStyleFromControls();
    setStatus(`Texture caricata: ${basename(uploadedPath)}`);
  } catch (error) {
    setStatus(error.message, 'err');
  } finally {
    obstacleTextureInput.value = '';
  }
});

clearObstacleTextureBtn.addEventListener('click', () => {
  state.selectedTexturePath = null;
  updateTextureLabels();
  applyLiveStyleFromControls();
});

clearColorInput.addEventListener('input', updateBackgroundVisualsFromInputs);
backgroundSpriteInput.addEventListener('change', async () => {
  const file = backgroundSpriteInput.files && backgroundSpriteInput.files[0];
  if (!file) return;

  try {
    const uploadedPath = await uploadImageFile(file);
    state.map.visuals = {
      ...(state.map.visuals || {}),
      backgroundSprite: uploadedPath
    };
    updateTextureLabels();
    updateBackgroundVisualsFromInputs();
    setStatus(`Background caricato: ${basename(uploadedPath)}`);
  } catch (error) {
    setStatus(error.message, 'err');
  } finally {
    backgroundSpriteInput.value = '';
  }
});

clearBackgroundTextureBtn.addEventListener('click', () => {
  state.map.visuals = {
    ...(state.map.visuals || {}),
    backgroundSprite: null
  };
  updateTextureLabels();
  updateBackgroundVisualsFromInputs();
});

backgroundTileSizeInput.addEventListener('input', updateBackgroundVisualsFromInputs);
backgroundModeInput.addEventListener('change', updateBackgroundVisualsFromInputs);
defaultObstacleTextureInput.addEventListener('change', async () => {
  const file = defaultObstacleTextureInput.files && defaultObstacleTextureInput.files[0];
  if (!file) return;

  try {
    const uploadedPath = await uploadImageFile(file);
    state.map.visuals = {
      ...(state.map.visuals || {}),
      obstacleSprite: uploadedPath
    };
    updateTextureLabels();
    updateBackgroundVisualsFromInputs();
    setStatus(`Texture default obstacle caricata: ${basename(uploadedPath)}`);
  } catch (error) {
    setStatus(error.message, 'err');
  } finally {
    defaultObstacleTextureInput.value = '';
  }
});

clearDefaultObstacleTextureBtn.addEventListener('click', () => {
  state.map.visuals = {
    ...(state.map.visuals || {}),
    obstacleSprite: null
  };
  updateTextureLabels();
  updateBackgroundVisualsFromInputs();
});

undoBtn.addEventListener('click', () => {
  if (state.undoStack.length === 0) {
    setStatus('Niente da annullare', 'err');
    return;
  }

  state.obstacles = state.undoStack.pop();
  clearSelection();
  refreshSelectedStyleControls();
  setStatus('Undo eseguito');
  draw();
});

clearBtn.addEventListener('click', () => {
  if (!state.obstacles.length) return;
  pushUndoSnapshot();
  state.obstacles = [];
  clearSelection();
  refreshSelectedStyleControls();
  setStatus('Obstacle rimossi');
  draw();
});

reloadBtn.addEventListener('click', async () => {
  try {
    await loadMap(state.activeMapId);
    setStatus('Mappa ricaricata dal server');
  } catch (error) {
    setStatus(error.message, 'err');
  }
});

saveBtn.addEventListener('click', async () => {
  if (!state.activeMapId) return;

  try {
    const payload = await fetchJsonOrThrow(`/api/maps/${encodeURIComponent(state.activeMapId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        obstacles: state.obstacles,
        visuals: state.map.visuals || {}
      })
    });

    setStatus(`Salvato. Obstacles: ${payload.savedObstacles}`);
  } catch (error) {
    setStatus(error.message, 'err');
  }
});

mapSelect.addEventListener('change', async () => {
  const mapId = mapSelect.value;
  if (!mapId) return;
  await loadMap(mapId);
});

async function loadMapList() {
  const payload = await fetchJsonOrThrow('/api/maps');
  state.mapMeta = payload.maps || [];
  state.activeMapId = payload.activeMapId;

  mapSelect.innerHTML = '';
  for (const mapInfo of state.mapMeta) {
    const option = document.createElement('option');
    option.value = mapInfo.id;
    option.textContent = `${mapInfo.id} (${mapInfo.name})`;
    mapSelect.appendChild(option);
  }

  if (!state.activeMapId && state.mapMeta.length) {
    state.activeMapId = state.mapMeta[0].id;
  }

  mapSelect.value = state.activeMapId;
}

async function loadMap(mapId) {
  const payload = await fetchJsonOrThrow(`/api/maps/${encodeURIComponent(mapId)}`);
  state.activeMapId = payload.id;
  state.map = payload.map;
  state.obstacles = cloneObstacles(Array.isArray(payload.map.obstacles) ? payload.map.obstacles : []);
  state.undoStack = [];
  clearSelection();
  state.drag = null;
  state.draftStart = null;
  state.draftEnd = null;

  state.map.visuals = {
    ...(state.map.visuals || {})
  };

  applyMapVisualsToInputs(state.map.visuals);
  updateBackgroundVisualsFromInputs();
  refreshSelectedStyleControls();
  updateTextureLabels();

  mapSelect.value = payload.id;
  computeViewTransform();
  draw();
}

(async function init() {
  try {
    await loadMapList();
    await loadMap(state.activeMapId);
    setStatus('Editor pronto');
  } catch (error) {
    setStatus(error.message, 'err');
  }
})();
