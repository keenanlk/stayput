/**
 * Profile pictures from cut-outs: the subject on a solid colour, framed as a
 * square or a circle. When a face is found the frame is built around it (face
 * about 40% of the width, eyes a little above the middle); otherwise, for pets
 * and objects, the whole subject is fitted in.
 */
import { makeCanvas } from './image';
import type { Landmarks } from './faces';

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface AvatarOptions {
  size: number;
  background: string;
  shape: 'circle' | 'square';
}

export interface Frame {
  /** Source rectangle, in image pixels, that fills the square. */
  x: number;
  y: number;
  side: number;
}

/** A square around the face: face width about 40% of the frame, eyes at 42% of its height. */
export function faceFrame(face: Landmarks, imageHeight: number): Frame {
  // Where the photo stops below the shoulders, zoom in rather than show a hard
  // edge of background colour under them.
  const side = Math.min(face.box.w / 0.4, (imageHeight - face.eyes.y) / 0.58);
  return { x: face.eyes.x - side / 2, y: face.eyes.y - side * 0.42, side };
}

/** A square that fits the whole subject with a little room, centred on it. */
export function subjectFrame(box: { x: number; y: number; w: number; h: number }, imageHeight: number): Frame {
  const side = Math.max(box.w, box.h) / 0.86;
  // A subject cut off by the bottom of the photo sits on the frame's bottom edge.
  const y = box.y + box.h >= imageHeight - 3 ? box.y + box.h - side : box.y + box.h / 2 - side / 2;
  return { x: box.x + box.w / 2 - side / 2, y, side };
}

export function renderAvatar(cut: Canvas, frame: Frame, o: AvatarOptions): Canvas {
  const out = makeCanvas(o.size, o.size);
  const ctx = out.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (o.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(o.size / 2, o.size / 2, o.size / 2, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.fillStyle = o.background;
  ctx.fillRect(0, 0, o.size, o.size);
  const s = o.size / frame.side;
  ctx.drawImage(cut, -frame.x * s, -frame.y * s, cut.width * s, cut.height * s);
  return out;
}
