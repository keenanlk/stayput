/**
 * Entry script for landing pages (format pairs and tool presets). The page
 * says which tool it is a preset of in data-base; the matching tool module
 * is loaded on demand and mounts the shared shell exactly as it does on the
 * tool's own page. Modules are listed explicitly so the bundler can split them.
 */
const modules: Record<string, () => Promise<unknown>> = {
  'convert-image': () => import('./convert-image'),
  'compress-image': () => import('./compress-image'),
  'strip-exif': () => import('./strip-exif'),
  'merge-pdf': () => import('./merge-pdf'),
  'split-pdf': () => import('./split-pdf'),
  'image-to-pdf': () => import('./image-to-pdf'),
  'pdf-to-image': () => import('./pdf-to-image'),
  'pdf-to-word': () => import('./pdf-to-word'),
  'crop-image': () => import('./crop-image'),
  'reorder-pdf': () => import('./reorder-pdf'),
  'sign-pdf': () => import('./sign-pdf'),
  'video-to-gif': () => import('./video-to-gif'),
  'blur-image': () => import('./blur-image'),
  'rotate-image': () => import('./rotate-image'),
  'video-to-mp3': () => import('./video-to-mp3'),
  'gif-to-mp4': () => import('./gif-to-mp4'),
  'compress-video': () => import('./compress-video'),
  'video-to-mp4': () => import('./video-to-mp4'),
  'compress-png': () => import('./compress-png'),
  'compress-gif': () => import('./compress-gif'),
  'trim-video': () => import('./trim-video'),
  'mute-video': () => import('./mute-video'),
  'resize-video': () => import('./resize-video'),
  'rotate-video': () => import('./rotate-video'),
  'crop-video': () => import('./crop-video'),
  'video-speed': () => import('./video-speed'),
  'merge-videos': () => import('./merge-videos'),
  'add-audio-to-video': () => import('./add-audio-to-video'),
  'reverse-video': () => import('./reverse-video'),
  'video-to-jpg': () => import('./video-to-jpg'),
  'trim-audio': () => import('./trim-audio'),
  'qr-code-generator': () => import('./qr-code-generator'),
  'merge-audio': () => import('./merge-audio'),
  'volume-booster': () => import('./volume-booster'),
  'audio-converter': () => import('./audio-converter'),
  'image-to-text': () => import('./image-to-text'),
  'color-picker': () => import('./color-picker'),
  'remove-background': () => import('./remove-background'),
  'passport-photo': () => import('./passport-photo'),
  'watermark-image': () => import('./watermark-image'),
  'watermark-pdf': () => import('./watermark-pdf'),
  'remove-pdf-metadata': () => import('./remove-pdf-metadata'),
  'sticker-maker': () => import('./sticker-maker'),
  'profile-picture-maker': () => import('./profile-picture'),
};

const base = document.getElementById('tool')?.dataset.base ?? '';
const load = modules[base];
if (!load) throw new Error(`No tool module for landing page base "${base}"`);
void load();
