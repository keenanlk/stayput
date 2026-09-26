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
};

const base = document.getElementById('tool')?.dataset.base ?? '';
const load = modules[base];
if (!load) throw new Error(`No tool module for landing page base "${base}"`);
void load();
