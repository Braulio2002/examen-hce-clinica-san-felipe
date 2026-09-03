# =============================================================================
# EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
# Imagen del BackEnd (monorepo NestJS con 4 aplicaciones).
#
# Se usa una unica imagen parametrizada por el argumento APP en lugar de cuatro
# Dockerfiles casi identicos: los cuatro servicios comparten dependencias y
# libreria compartida, de modo que Docker reutiliza las capas y el build total
# es sensiblemente mas rapido. El servicio concreto se elige con la variable
# APP en tiempo de ejecucion.
#
# Construccion multi-etapa:
#   1. dependencias : instala node_modules completos (incluye devDependencies).
#   2. build        : compila TypeScript a JavaScript.
#   3. produccion   : imagen final, solo dependencias de produccion y dist.
# =============================================================================

# --- Etapa 1: dependencias ---------------------------------------------------
FROM node:22-alpine AS dependencias

WORKDIR /app

# Se copian solo los manifiestos primero: si no cambian, Docker reutiliza la
# capa de npm ci aunque haya cambiado el codigo fuente.
COPY package*.json ./
RUN npm ci

# --- Etapa 2: compilacion ----------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY --from=dependencias /app/node_modules ./node_modules
COPY package*.json nest-cli.json tsconfig*.json ./
COPY libs ./libs
COPY apps ./apps

RUN npm run build

# --- Etapa 3: imagen de produccion -------------------------------------------
FROM node:22-alpine AS produccion

# curl se usa unicamente para el healthcheck del API Gateway.
RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production

# Solo dependencias de produccion: la imagen final no lleva compilador de
# TypeScript, ni jest, ni el resto de herramientas de desarrollo.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# La imagen node:alpine ya trae el usuario sin privilegios "node". Ejecutar como
# root dentro del contenedor es innecesario y amplia el impacto de cualquier
# vulnerabilidad de la aplicacion.
USER node

# Aplicacion a ejecutar: api-gateway | ms-auth | ms-catalogo | ms-inventario
ARG APP=api-gateway
ENV APP=${APP}

EXPOSE 4000

# La forma "sh -c" es necesaria para que se expanda la variable APP.
CMD ["sh", "-c", "node dist/apps/${APP}/src/infraestructura/main.js"]
