# multiplayer-arena-shooter

Starter didattico per una lezione di web design/game dev web.

Tecnologie:
- Node.js
- Express
- Socket.IO (WebSocket)
- Vite (dev server frontend opzionale)
- HTML/CSS/JS vanilla
- Canvas 2D

Obiettivo: mostrare una base multiplayer **semplice ma completa**, con server autorevole e client leggero.

## Caratteristiche incluse
- Multiplayer realtime via WebSocket
- Join screen con nickname
- Player con movimento WASD
- Mira mouse + sparo
- Proiettili
- Ostacoli statici
- Nemici NPC semplici gestiti dal server
- Collisioni basilari
- HP, score, kills, respawn
- HUD minimale
- Messaggi feedback quando vieni colpito o eliminato

## Struttura progetto

```txt
multiplayer-arena-shooter/
├── package.json
├── README.md
├── server/
│   ├── index.js
│   ├── gameConfig.js
│   └── gameState.js
└── public/
    ├── index.html
    ├── styles.css
    ├── assets/
    │   └── README.txt
    └── js/
        ├── main.js
        ├── input.js
        ├── render.js
        ├── hud.js
        └── theme.js
```

## Avvio

Prerequisito: Node.js 18+.

```bash
npm install
npm start
```

Apri nel browser:
- `http://localhost:3000`

Per una demo locale in aula, apri lo stesso URL da piu' browser/dispositivi nella stessa LAN usando l'IP del computer server (es. `http://192.168.1.10:3000`).

### Sviluppo client con Vite (opzionale)

In un terminale avvia il server di gioco:
```bash
npm run dev
```

In un secondo terminale avvia Vite:
```bash
npm run dev:client
```

Apri `http://localhost:5173`.
La connessione Socket.IO viene proxata automaticamente verso il backend (`http://localhost:3000` di default, modificabile con `VITE_BACKEND_URL`).

## Server autorevole vs client

- `server/` decide stato reale del gioco:
  - movimento valido
  - collisioni
  - danni e morte
  - respawn
  - AI NPC
  - punteggi
- `public/` fa solo:
  - input utente
  - rendering Canvas
  - HUD

Questa separazione e' utile per didattica su anti-cheat base e responsabilita' dei layer.

## Dove modificare cosa

### Gameplay
- Modifica `server/gameConfig.js`:
  - velocita'
  - cooldown sparo
  - danno
  - numero NPC
  - dimensione mondo
  - ostacoli/spawn

- Modifica `server/gameState.js`:
  - regole collisione
  - logica AI NPC
  - regole punteggio

### Grafica e stile
- Modifica `public/js/theme.js` per palette e rendering placeholders
- Modifica `public/styles.css` per UI/HUD/join screen
- Modifica `public/js/render.js` per cambiare il linguaggio visivo Canvas

### UI
- Modifica `public/index.html` per layout schermate
- Modifica `public/js/hud.js` per metriche mostrate

## Estensioni didattiche suggerite
1. Aggiungere team (rosso/blu) e friendly fire off
2. Aggiungere pick-up (heal/ammo) con spawn periodico server-side
3. Introdurre diverse armi con rateo/danno differenti
4. Aggiungere minimappa HUD
5. Implementare round timer e win conditions
6. Sostituire forme geometriche con sprite da `public/assets/`
7. Implementare interpolazione client piu' avanzata

## Note
- Nessun database, nessun framework frontend, nessuna libreria di fisica.
- Il codice e' volutamente semplice e commentato per essere letto e modificato in classe.
