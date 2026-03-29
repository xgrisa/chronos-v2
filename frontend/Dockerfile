# ── Etapa 1: Build ─────────────────────────────────────────────
# Compilamos la app Angular en un contenedor temporal con Node.
# Esta imagen no llega a producción.
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .
RUN npm run build

# ── Etapa 2: Serve ─────────────────────────────────────────────
# Solo copiamos los ficheros estáticos compilados a Nginx.
# La imagen final no tiene Node.js ni el código fuente.
FROM nginx:alpine

COPY --from=build /app/dist/chronos-frontend/browser /usr/share/nginx/html

EXPOSE 80
