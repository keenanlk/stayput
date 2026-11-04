# Self-hosted Stayput: build the static site, serve dist/ from nginx.
#   docker build -t stayput .
#   docker run -p 8080:80 stayput
# The build leaves out analytics by default. To turn the usage counter on:
#   docker build --build-arg PUBLIC_ANALYTICS=on -t stayput .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# "off": no usage-counting script, no request to the stats host, and a CSP without that host.
ARG PUBLIC_ANALYTICS=off
ENV PUBLIC_ANALYTICS=$PUBLIC_ANALYTICS
RUN npm run build \
 && node scripts/nginx-conf.mjs /out/nginx --analytics="$PUBLIC_ANALYTICS"

FROM nginx:alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/stayput.conf
COPY --from=build /out/nginx /etc/nginx/stayput
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
