export function makeDraggableScroll(target: HTMLElement): void {
  if (!target) return;

  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  target.addEventListener('pointerdown', (event) => {
    isDown = true;
    startX = event.clientX;
    scrollLeft = target.scrollLeft;
    target.setPointerCapture?.(event.pointerId);
  });

  target.addEventListener('pointerup', () => {
    isDown = false;
  });

  target.addEventListener('pointerleave', () => {
    isDown = false;
  });

  target.addEventListener('pointermove', (event) => {
    if (!isDown) return;
    const walk = event.clientX - startX;
    target.scrollLeft = scrollLeft - walk;
  });
}
