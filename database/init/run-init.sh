#!/bin/bash
# =============================================================================
# EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
# Inicializacion de la base de datos SQL Server dentro de Docker.
#
# Este script lo ejecuta el servicio "db-init" del docker-compose.yml una unica
# vez, cuando el contenedor de SQL Server ya responde. Aplica los scripts en
# orden y aborta el arranque completo si alguno falla (-b hace que sqlcmd
# devuelva un codigo de salida distinto de cero ante un error de T-SQL).
# =============================================================================
set -euo pipefail

SQLCMD="/opt/mssql-tools18/bin/sqlcmd"
DB_HOST="${DB_HOST:-sqlserver}"
DB_PORT="${DB_PORT:-1433}"
DB_USER="${DB_USER:-sa}"
DB_PASSWORD="${MSSQL_SA_PASSWORD:?La variable MSSQL_SA_PASSWORD es obligatoria}"
SCRIPTS_DIR="${SCRIPTS_DIR:-/scripts}"

echo ">> Esperando a que SQL Server acepte conexiones en ${DB_HOST}:${DB_PORT}..."

for intento in $(seq 1 60); do
  if "$SQLCMD" -S "${DB_HOST},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -l 5 \
       -Q "SELECT 1" > /dev/null 2>&1; then
    echo ">> SQL Server acepta conexiones (intento ${intento})."
    break
  fi
  if [ "$intento" -eq 60 ]; then
    echo "!! SQL Server no respondio tras 60 intentos. Se aborta la inicializacion." >&2
    exit 1
  fi
  sleep 2
done

# -----------------------------------------------------------------------------
# Que el motor acepte conexiones NO significa que las bases esten disponibles.
#
# Cuando el volumen ya contiene HCE_Insumos, SQL Server sigue recuperandola
# despues de aceptar la primera conexion, y cualquier ALTER DATABASE contra ella
# falla con "Database N cannot be autostarted during server shutdown or
# startup". Ese fallo aparecio al reiniciar el compose sobre datos existentes, y
# dejaba todo el ecosistema abajo porque los microservicios esperan a que este
# contenedor termine con exito.
#
# Se espera a que ninguna base quede fuera de estado ONLINE antes de continuar.
# -----------------------------------------------------------------------------
echo ">> Esperando a que las bases de datos terminen de recuperarse..."

for intento in $(seq 1 60); do
  pendientes=$("$SQLCMD" -S "${DB_HOST},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -h -1 -W \
    -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.databases WHERE state_desc <> 'ONLINE';" \
    2>/dev/null | tr -d '[:space:]')

  if [ "$pendientes" = "0" ]; then
    echo ">> Todas las bases estan en linea (intento ${intento})."
    break
  fi
  if [ "$intento" -eq 60 ]; then
    echo "!! Hay bases que no llegaron a estado ONLINE. Se aborta la inicializacion." >&2
    exit 1
  fi
  sleep 2
done

for script in 01-schema.sql 02-triggers-auditoria.sql 03-stored-procedures.sql 05-seed.sql; do
  ruta="${SCRIPTS_DIR}/${script}"
  if [ ! -f "$ruta" ]; then
    echo "!! No se encontro el script ${ruta}" >&2
    exit 1
  fi
  echo ">> Ejecutando ${script}..."
  "$SQLCMD" -S "${DB_HOST},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -i "$ruta"
done

echo ">> Base de datos HCE_Insumos inicializada correctamente."
