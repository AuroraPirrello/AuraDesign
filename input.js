export function createInputController(canvas) {
  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    interact: false,
    aimAngle: 0
  };

  const keyMap = {
    KeyW: 'up',
    ArrowUp: 'up',
    KeyS: 'down',
    ArrowDown: 'down',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    Space: 'interact'
  };

  function onKeyChange(event, isPressed) {
    const target = event.target;
    const isTypingTarget =
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);
    if (isTypingTarget) return;

    const action = keyMap[event.code];
    if (!action) return;
    input[action] = isPressed;
    event.preventDefault();
  }

  window.addEventListener('keydown', (event) => onKeyChange(event, true));
  window.addEventListener('keyup', (event) => onKeyChange(event, false));



  // L'angolo finale viene calcolato in main.js usando la camera corrente.
  const mouse = { x: 0, y: 0 };
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });

  return { input, mouse };
}
