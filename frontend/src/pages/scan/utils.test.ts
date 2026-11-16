import test from 'node:test';
import assert from 'node:assert/strict';

import { getPageCropBounds } from './utils.ts';

test('getPageCropBounds derives the active crop rectangle from page corners', () => {
  const result = getPageCropBounds(
    {
      corners: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
    },
    1000,
    800
  );

  assert.deepEqual(result, {
    x: 100,
    y: 80,
    width: 800,
    height: 640,
  });
});
