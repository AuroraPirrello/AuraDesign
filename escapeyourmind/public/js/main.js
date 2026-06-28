import { createInputController } from './input.js';
import { renderGame } from './render.js';
import { updateHud } from './hud.js';
import { visualConfig as v } from './theme.js';

const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const joinScreen = document.getElementById('joinScreen');
const joinStep1 = document.getElementById('joinStep1');
const joinStep2 = document.getElementById('joinStep2');
const joinStep3 = document.getElementById('joinStep3');
const joinStepError = document.getElementById('joinStepError');
const joinForm = document.getElementById('joinForm');
const confirmYesBtn = document.getElementById('confirmYesBtn');
const confirmNoBtn = document.getElementById('confirmNoBtn');
const startGameBtn = document.getElementById('startGameBtn');
const retryBtn = document.getElementById('retryBtn');
const nicknameInput = document.getElementById('nickname');
const hud = document.getElementById('hud');
const deathOverlay = document.getElementById('deathOverlay');
const victoryScreen = document.getElementById('victoryScreen');

const hudElements = {
  statusLabel: document.getElementById('statusLabel')
};

const { input, mouse } = createInputController(canvas);

const game = {
  selfPlayerId: null,
  state: null,
  camera: { x: 0, y: 0 },
  joined: false,
  feedback: {
    text: '',
    expiresAt: 0
  },
  interactionCounts: {},
  unlockedWinRects: [],
  hasWon: false
};
let wasInteractDown = false;
let deathOverlayTimeout = null;
let audioCtx = null;

let currentWorldWidth = 0;
let currentWorldHeight = 0;

function syncCanvasSize(state) {
  if (state && (state.world.width !== currentWorldWidth || state.world.height !== currentWorldHeight)) {
    currentWorldWidth = state.world.width;
    currentWorldHeight = state.world.height;
    canvas.width = currentWorldWidth;
    canvas.height = currentWorldHeight;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateCamera() {
  if (!game.state || !game.selfPlayerId) return;
  const self = game.state.players.find((p) => p.id === game.selfPlayerId);
  if (!self) return;
  const mapCameraLerp = Number(game.state?.mapVisuals?.cameraLerp);
  const cameraLerp = Number.isFinite(mapCameraLerp) ? mapCameraLerp : v.cameraLerp;

  const targetX = self.x - canvas.width / 2;
  const targetY = self.y - canvas.height / 2;

  const maxX = Math.max(0, game.state.world.width - canvas.width);
  const maxY = Math.max(0, game.state.world.height - canvas.height);

  game.camera.x += (clamp(targetX, 0, maxX) - game.camera.x) * cameraLerp;
  game.camera.y += (clamp(targetY, 0, maxY) - game.camera.y) * cameraLerp;
}

function updateAimAngle() {
  if (!game.state || !game.selfPlayerId) return;
  const self = game.state.players.find((p) => p.id === game.selfPlayerId);
  if (!self) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const worldMouseX = (mouse.x * scaleX) + game.camera.x;
  const worldMouseY = (mouse.y * scaleY) + game.camera.y;
  input.aimAngle = Math.atan2(worldMouseY - self.y, worldMouseX - self.x);
}

let lastInputSend = 0;
function sendInput() {
  const now = performance.now();
  if (!game.joined || now - lastInputSend < 33) return;
  lastInputSend = now;
  socket.emit('input', input);
}

function gameLoop() {
  if (game.state) {
    syncCanvasSize(game.state);
  }
  updateCamera();
  updateAimAngle();
  sendInput();
  renderGame(ctx, canvas, {
    state: game.state,
    selfPlayerId: game.selfPlayerId,
    camera: game.camera
  });

  if (game.hasWon) return;

  const activeFeedback =
    game.feedback.expiresAt > performance.now() ? game.feedback.text : '';
  
  // Proximity check for interactions and Cursor Hover
  let interactionPrompt = '';
  let isHoveringInteraction = false;
  if (game.state && game.selfPlayerId) {
    const self = game.state.players.find(p => p.id === game.selfPlayerId);
    if (self && self.alive) {
      const now = performance.now();
      
      // Get world mouse for hover check
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const worldMouseX = (mouse.x * scaleX) + game.camera.x;
      const worldMouseY = (mouse.y * scaleY) + game.camera.y;

      for (let i = 0; i < game.state.obstacles.length; i++) {
        const obs = game.state.obstacles[i];
        if (!obs.isInteraction) continue;
        
        // Proximity prompt
        const dx = self.x - (obs.x + obs.width / 2);
        const dy = self.y - (obs.y + obs.height / 2);
        const dist = Math.hypot(dx, dy);
        const threshold = Math.max(obs.width, obs.height) / 2 + 60;
        
        if (dist < threshold) {
          const type = obs.interactionType || 'proximity';
          if (type === 'proximity') {
            const promptSuffix = obs.usePassword ? ' per la PASSWORD' : '';
            interactionPrompt = `Premi SPAZIO per interagire${promptSuffix}`;
            
            const isJustPressed = input.interact && !wasInteractDown;
            if (isJustPressed) {
              handleInteraction(obs, i);
            }
          }
        }

        // Hover check for cursor (only for 'click' type)
        if (obs.interactionType === 'click') {
          if (
            worldMouseX >= obs.x &&
            worldMouseX <= obs.x + obs.width &&
            worldMouseY >= obs.y &&
            worldMouseY <= obs.y + obs.height
          ) {
            isHoveringInteraction = true;
          }
        }
      }
      wasInteractDown = input.interact;

      // Check Win Condition
      for (const rect of game.unlockedWinRects) {
        if (
          self.x >= rect.x &&
          self.x <= rect.x + rect.width &&
          self.y >= rect.y &&
          self.y <= rect.y + rect.height
        ) {
          showVictory();
          break;
        }
      }
    }
  }

  canvas.style.cursor = isHoveringInteraction ? 'pointer' : 'default';

  updateHud(hudElements, game.state, game.selfPlayerId, activeFeedback || interactionPrompt);
  requestAnimationFrame(gameLoop);
}

function getInteractionText(obstacle, index) {
  const texts = obstacle.interactionText;
  if (!Array.isArray(texts)) return texts || 'Ti servono tre numeri';
  if (texts.length === 0) return 'Ti servono tre numeri';
  
  const count = game.interactionCounts[index] || 0;
  return texts[count % texts.length];
}

function setFeedback(text, durationMs = 1200) {
  game.feedback.text = text;
  game.feedback.expiresAt = performance.now() + durationMs;
}

function handleInteraction(obs, index) {
  if (obs.usePassword) {
    const answer = prompt(getInteractionText(obs, index) + "\n\nInserisci la password:");
    if (answer === null) return; // Cancelled
    
    if (answer.trim() === obs.correctPassword) {
      socket.emit('unlockObstacle', { targetId: obs.unlockTargetId });
      setFeedback("Password corretta!", 2000);
    } else {
      setFeedback("Password errata.", 2000);
    }
  } else {
    const text = getInteractionText(obs, index);
    setFeedback(text, 2500);
    game.interactionCounts[index] = (game.interactionCounts[index] || 0) + 1;
  }
}

function showVictory() {
  if (game.hasWon) return;
  game.hasWon = true;
  victoryScreen.style.display = 'flex';
  
  // Stop player movement
  input.up = input.down = input.left = input.right = false;
  input.interact = false;
  socket.emit('input', input);
}

function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      audioCtx = new Ctx();
    }
  }
  return audioCtx;
}

function playDeathSound() {
  const ctxAudio = getAudioContext();
  if (!ctxAudio) return;

  const startAt = ctxAudio.currentTime;
  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  const filter = ctxAudio.createBiquadFilter();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(280, startAt);
  osc.frequency.exponentialRampToValueAtTime(60, startAt + 0.55);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, startAt);
  filter.frequency.exponentialRampToValueAtTime(220, startAt + 0.55);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.32, startAt + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.58);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctxAudio.destination);

  osc.start(startAt);
  osc.stop(startAt + 0.6);
}

function showDeathOverlay(durationMs) {
  if (!deathOverlay) return;

  deathOverlay.classList.remove('hidden');
  deathOverlay.classList.add('visible');

  if (deathOverlayTimeout) {
    clearTimeout(deathOverlayTimeout);
  }

  deathOverlayTimeout = window.setTimeout(() => {
    deathOverlay.classList.remove('visible');
    deathOverlay.classList.add('hidden');
  }, durationMs);
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  joinStep1.classList.add('hidden');
  joinStep2.classList.remove('hidden');
});

confirmNoBtn.addEventListener('click', () => {
  joinStep2.classList.add('hidden');
  joinStepError.classList.remove('hidden');
});

retryBtn.addEventListener('click', () => {
  joinStepError.classList.add('hidden');
  joinStep1.classList.remove('hidden');
});

confirmYesBtn.addEventListener('click', () => {
  joinStep2.classList.add('hidden');
  joinStep3.classList.remove('hidden');
});

startGameBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const ctxAudio = getAudioContext();
  if (ctxAudio && ctxAudio.state === 'suspended') {
    ctxAudio.resume().catch(() => {});
  }
  socket.emit('join', { nickname });
});

socket.on('joined', ({ playerId }) => {
  game.selfPlayerId = playerId;
  game.joined = true;
  joinScreen.classList.add('hidden');
  hud.classList.remove('hidden');
});

socket.on('obstacleUnlocked', (data) => {
  if (data.isWinBlocker) {
    game.unlockedWinRects.push(data.rect);
  }
  setFeedback("Qualcosa si è sbloccato...", 2500);
});

socket.on('state', (newState) => {
  if (game.state) {
    newState.players.forEach(newPlayer => {
      const oldPlayer = game.state.players.find(p => p.id === newPlayer.id);
      if (oldPlayer) {
        if (newPlayer.x > oldPlayer.x) newPlayer.facingRight = true;
        else if (newPlayer.x < oldPlayer.x) newPlayer.facingRight = false;
        else newPlayer.facingRight = oldPlayer.facingRight ?? true;
      } else {
        newPlayer.facingRight = true;
      }
    });
  }
  game.state = newState;
});

socket.on('playerHit', ({ damage, hp, maxHp }) => {
  setFeedback(`Colpito: -${damage} HP (${hp}/${maxHp})`, 900);
});

socket.on('playerDeath', ({ attackerName, respawnAt }) => {
  const msToRespawn = Math.max(1200, Math.min(4000, (respawnAt || 0) - Date.now()));
  showDeathOverlay(msToRespawn);
  playDeathSound();
  setFeedback(`Sei stato eliminato da ${attackerName}.`, 1800);
});

socket.on('killFeed', (message) => {
  setFeedback(message, 1200);
});

socket.on('connect_error', () => {
  hudElements.statusLabel.textContent = 'Errore di connessione al server';
});

canvas.addEventListener('click', (event) => {
  if (!game.state || !game.joined) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const screenX = (event.clientX - rect.left) * scaleX;
  const screenY = (event.clientY - rect.top) * scaleY;

  // Convert to world coords using game.camera
  const worldX = screenX + game.camera.x;
  const worldY = screenY + game.camera.y;

  // Check click on obstacles
  for (let i = 0; i < game.state.obstacles.length; i++) {
    const obs = game.state.obstacles[i];
    if (obs.isInteraction && obs.interactionType === 'click') {
      if (
        worldX >= obs.x &&
        worldX <= obs.x + obs.width &&
        worldY >= obs.y &&
        worldY <= obs.y + obs.height
      ) {
        handleInteraction(obs, i);
        break;
      }
    }
  }
});

requestAnimationFrame(gameLoop);
