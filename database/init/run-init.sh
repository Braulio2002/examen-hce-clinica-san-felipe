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
    echo ">> SQL Server disponible (intento ${intento})."
    break
  fi
  if [ "$intento" -eq 60 ]; then
    echo "!! SQL Server no respondio tras 60 intentos. Se aborta la inicializacion." >&2
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
