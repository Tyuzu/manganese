// grain.worker.ts
self.onmessage = (e: MessageEvent<{ buffer: ArrayBuffer; width: number; height: number; amount: number }>) => {
  const { buffer, amount } = e.data;
  const data = new Uint8ClampedArray(buffer);
  const strength = (amount / 100) * 40;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * strength;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));         // Red
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise)); // Green
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise)); // Blue
  }

  // Send the ArrayBuffer back to the main thread.
  self.postMessage({ buffer: data.buffer });
};