# ========== Dependencias ==========
FROM node:18-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ \
  && ln -sf python3 /usr/bin/python
COPY package*.json ./
RUN npm ci

# ========== Runner ==========
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copiamos node_modules ya resueltas
COPY --from=deps /app/node_modules ./node_modules

# Copiamos package.json para referencia
COPY package*.json ./

# Copiamos explícitamente la carpeta src completa
COPY src ./src

# ✅ Copiamos el archivo .env al contenedor (si existe)
COPY .env* ./

# Puerto donde escucha tu app
EXPOSE 5000

# Healthcheck (opcional)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:5000/ping || exit 1

# ✅ Cambiamos el punto de entrada a la ruta correcta
CMD ["node", "src/server.js"]
