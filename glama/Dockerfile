# Build for Glama's directory checks only. It runs the local stdio server so
# Glama's mcp-proxy can start it and answer MCP introspection. The published
# npm package (`npx -y stayput-mcp`, see mcp/README.md) is how everyone else
# installs it; this file must not replace that.
#
# Build context is the repository root, because mcp/'s build bundles PDF and
# metadata code straight from ../../src/lib (see mcp/build.mjs):
#   docker build -f glama/Dockerfile .
#
# Glama's published glama.json schema (https://glama.ai/mcp/schemas/server.json)
# only defines `maintainers`; the build steps, CMD and env schema are entered on
# the server's Dockerfile admin page. The values to enter there are:
#   build steps: npm ci --ignore-scripts --prefix mcp && npm run build --prefix mcp
#   CMD:         node mcp/dist/index.js
# (This file is the same recipe as a runnable Docker build, kept for local checks.)
#
# No environment variables are required or read — the server only touches
# files given as tool arguments and makes no network requests.

FROM node:20-alpine AS builder
WORKDIR /app

COPY mcp/package.json mcp/package-lock.json ./mcp/
RUN cd mcp && npm ci --ignore-scripts

COPY src/lib ./src/lib
COPY src/data/vendor.json ./src/data/vendor.json
COPY mcp/build.mjs ./mcp/build.mjs
COPY mcp/src ./mcp/src
RUN cd mcp && npm run build

FROM node:20-alpine
WORKDIR /app

COPY mcp/package.json mcp/package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev

COPY --from=builder /app/mcp/dist ./dist

USER node
CMD ["node", "dist/index.js"]
