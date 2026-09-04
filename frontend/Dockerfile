# =============================================================================
# EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
# Imagen del FrontEnd (monorepo de workspaces con las dos zonas del microfront).
#
# Igual que en el BackEnd, una sola imagen parametrizada por el argumento APP
# construye cualquiera de las dos zonas: comparten dependencias y paquetes
# internos, de modo que Docker reutiliza capas entre ambas.
#
#   APP=shell       -> zona anfitriona (login, inicio, productos)
#   APP=inventario  -> zona de compras, ventas y Kardex
#
# Se usa la salida "standalone" de Next: la imagen final contiene solo el
# servidor y las dependencias que el trazado detecto como necesarias, no el
# node_modules completo del monorepo.
# =============================================================================

# --- Etapa 1: dependencias ---------------------------------------------------
FROM node:22-alpine AS dependencias

WORKDIR /app

# Los manifiestos de todos los workspaces primero, para aprovechar la cache.
COPY package*.json ./
COPY paquetes/api-cliente/package.json ./paquetes/api-cliente/
COPY paquetes/ui/package.json ./paquetes/ui/
COPY apps/shell/package.json ./apps/shell/
COPY apps/inventario/package.json ./apps/inventario/

RUN npm ci

# --- Etapa 2: compilacion ----------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

ARG APP=shell
# La URL del Gateway se incrusta en el bundle del navegador durante el build:
# NEXT_PUBLIC_* se resuelve en tiempo de compilacion, no de ejecucion.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Destino de la reescritura hacia la zona de inventario.
# Next resuelve rewrites() durante `next build` y congela el resultado en el
# manifiesto de rutas, de modo que esta URL debe existir en tiempo de
# CONSTRUCCION y no basta con inyectarla como variable de entorno al arrancar
# el contenedor. Por defecto apunta al nombre del servicio en la red de Docker.
ARG ZONA_INVENTARIO_URL=http://front-inventario:3000
ENV ZONA_INVENTARIO_URL=${ZONA_INVENTARIO_URL}

# Interruptor del bloque de credenciales sembradas en la pantalla de login.
# El valor por defecto es "false" a proposito: si alguien construye la imagen
# sin pasar nada, las credenciales NO viajan dentro. Hay que pedirlas.
ARG NEXT_PUBLIC_MOSTRAR_CREDENCIALES_DEMO=false
ENV NEXT_PUBLIC_MOSTRAR_CREDENCIALES_DEMO=${NEXT_PUBLIC_MOSTRAR_CREDENCIALES_DEMO}

ENV NEXT_TELEMETRY_DISABLED=1

# npm workspaces eleva todas las dependencias al node_modules de la raiz y crea
# alli los enlaces a los paquetes internos (@hce/ui, @hce/api-cliente), asi que
# un unico COPY basta: los directorios apps/*/node_modules no existen.
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .

RUN npm run build --workspace @hce/${APP}

# --- Etapa 3: imagen de produccion -------------------------------------------
FROM node:22-alpine AS produccion

WORKDIR /app

ARG APP=shell
ENV APP=${APP}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# La salida standalone ya trae su propio arbol de node_modules recortado.
COPY --from=build /app/apps/${APP}/.next/standalone ./
COPY --from=build /app/apps/${APP}/.next/static ./apps/${APP}/.next/static

# Usuario sin privilegios provisto por la imagen base.
USER node

EXPOSE 3000

# La forma "sh -c" es necesaria para expandir la variable APP.
CMD ["sh", "-c", "node apps/${APP}/server.js"]
