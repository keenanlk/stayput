// Worker entry point. The manifest is generated into dist/ by scripts/cloudflare-assets.mjs, so a
// `wrangler deploy` of a dist that was not prepared fails at bundling instead of serving the wrong files.
import manifest from '../dist/.cloudflare/oversize.json';
import { createHandler } from './handler.mjs';

export default createHandler(manifest);
