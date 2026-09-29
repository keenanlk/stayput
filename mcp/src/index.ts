import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, VERSION } from './server';

if (process.argv.includes('--version')) {
  console.log(VERSION);
  process.exit(0);
}

await createServer().connect(new StdioServerTransport());
