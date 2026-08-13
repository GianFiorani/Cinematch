import { ImageResponse } from 'next/og.js';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const GRADIENT = 'linear-gradient(135deg, #FD267A 0%, #FF6036 100%)';

function iconElement(fontSize) {
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: GRADIENT,
      },
      children: {
        type: 'div',
        props: { style: { fontSize, display: 'flex' }, children: '🍿' },
      },
    },
  };
}

async function writePng(filename, size, fontRatio) {
  const res = new ImageResponse(iconElement(Math.round(size * fontRatio)), { width: size, height: size });
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path.join(publicDir, filename), buf);
  console.log(`wrote ${filename} (${size}x${size}, ${buf.length} bytes)`);
}

await writePng('icon-512.png', 512, 0.55);
await writePng('icon-192.png', 192, 0.55);
// Apple recommends a fully opaque, slightly larger safe margin for the touch icon.
await writePng('apple-touch-icon.png', 180, 0.5);
