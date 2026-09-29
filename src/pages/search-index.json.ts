import type { APIRoute } from 'astro';
import { buildIndex } from '../data/search-index';

/** Index for the header search (src/lib/search-ui.ts), built from the page registries. */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildIndex()), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
