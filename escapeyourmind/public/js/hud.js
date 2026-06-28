export function updateHud(hudElements, state, selfPlayerId, feedbackMessage) {
  if (!state) return;

  const selfPlayer = state.players.find((p) => p.id === selfPlayerId);
  if (!selfPlayer) return;

  if (!selfPlayer.alive) {
    const msLeft = Math.max(0, selfPlayer.respawnAt - state.timestamp);
    const seconds = (msLeft / 1000).toFixed(1);
    hudElements.statusLabel.textContent = `Respawn tra ${seconds}s`;
    return;
  }

  hudElements.statusLabel.textContent = feedbackMessage || '';
}
