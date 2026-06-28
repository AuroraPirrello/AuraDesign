import characterTypes from './characterTypes.js';
import maps from './maps.js';

const defaultTypeIds = {
  player: 'playerDefault',
  npc: 'npcGrunt'
};

const playerType = characterTypes[defaultTypeIds.player] || {};
const npcType = characterTypes[defaultTypeIds.npc] || {};
const fallbackMapId = Object.keys(maps)[0];
const activeMapId = fallbackMapId;
const activeMap = maps[activeMapId] || {};
const activeWorld = activeMap.world || { width: 1200, height: 800 };
const activeObstacles = Array.isArray(activeMap.obstacles) ? activeMap.obstacles : [];
const activeSpawnPoints = Array.isArray(activeMap.spawnPoints) ? activeMap.spawnPoints : [];

export default {
  tickRate: 30,
  stateBroadcastRate: 20,
  characterTypeIds: defaultTypeIds,
  characterTypes,
  maps,
  map: {
    id: activeMapId,
    name: activeMap.name || 'Default Map',
    visuals: activeMap.visuals || {}
  },
  world: activeWorld,
  player: {
    radius: playerType.radius ?? 18,
    maxHp: playerType.maxHp ?? 100,
    speed: playerType.speed ?? 260,
    shootCooldownMs: playerType.shootCooldownMs ?? 220,
    respawnDelayMs: playerType.respawnDelayMs ?? 2500,
    bulletSpeed: playerType.bulletSpeed ?? 720,
    bulletDamage: playerType.bulletDamage ?? 20,
    bulletLifeMs: playerType.bulletLifeMs ?? 1300,
    bulletRadius: playerType.bulletRadius ?? 5,
    bulletSprite: playerType.bulletSprite ?? null
  },
  npc: {
    count: 0,
    radius: npcType.radius ?? 16,
    maxHp: npcType.maxHp ?? 50,
    speed: npcType.speed ?? 130,
    aggroRange: npcType.aggroRange ?? 600,
    shootCooldownMs: npcType.shootCooldownMs ?? 950,
    bulletSpeed: npcType.bulletSpeed ?? 460,
    bulletDamage: npcType.bulletDamage ?? 12,
    bulletLifeMs: npcType.bulletLifeMs ?? 1200,
    bulletRadius: npcType.bulletRadius ?? 5,
    bulletSprite: npcType.bulletSprite ?? null,
    scoreValue: npcType.scoreValue ?? 100
  },
  arena: {
    obstacles: JSON.parse(JSON.stringify(activeObstacles)),
    spawnPoints: activeSpawnPoints
  }
};
