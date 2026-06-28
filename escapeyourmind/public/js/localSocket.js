import { addPlayer, setPlayerInput, tick, serializeState, setEventHandlers, unlockObstacle } from './gameStateLocal.js';

class MockSocket {
  constructor() {
    this.listeners = {};
    this.playerId = 'local-player';
    this.gameInterval = null;
    this.lastTickTime = Date.now();

    // Configura gli handler degli eventi di gioco per rimandarli al client
    setEventHandlers({
      onPlayerHit: (data) => {
        this.trigger('playerHit', data);
      },
      onPlayerDeath: (data) => {
        this.trigger('playerDeath', {
          attackerName: data.attackerName,
          respawnAt: data.respawnAt
        });
      }
    });
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  trigger(event, data) {
    const list = this.listeners[event] || [];
    list.forEach(cb => cb(data));
  }

  emit(event, data) {
    if (event === 'join') {
      const player = addPlayer(this.playerId, data.nickname);
      
      // Ritardo minimo per simulare la connessione di rete
      setTimeout(() => {
        this.trigger('joined', { playerId: this.playerId });
        this.startLoop();
      }, 50);
    } 
    else if (event === 'input') {
      setPlayerInput(this.playerId, data);
    } 
    else if (event === 'unlockObstacle') {
      const unlocked = unlockObstacle(data.targetId);
      if (unlocked) {
        this.trigger('obstacleUnlocked', {
          targetId: data.targetId,
          rect: { x: unlocked.x, y: unlocked.y, width: unlocked.width, height: unlocked.height },
          isWinBlocker: !!unlocked.isWinBlocker
        });
      }
    }
  }

  startLoop() {
    if (this.gameInterval) return;
    this.lastTickTime = Date.now();
    this.gameInterval = setInterval(() => {
      const now = Date.now();
      const deltaSec = (now - this.lastTickTime) / 1000;
      this.lastTickTime = now;

      // Tick della fisica locale
      tick(deltaSec);

      // Invia lo stato al client
      this.trigger('state', serializeState());
    }, 1000 / 30); // 30 FPS
  }
}

// Inizializza la funzione globale io() se non è già definita dal server
if (typeof window.io === 'undefined') {
  window.io = function() {
    return new MockSocket();
  };
}

// Importa dinamicamente il file main.js del gioco per avviarlo dopo che io() è stato definito
import('./main.js');
