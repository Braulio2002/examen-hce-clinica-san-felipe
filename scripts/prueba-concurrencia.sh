#!/usr/bin/env bash
# =============================================================================
# EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
# Prueba de concurrencia: dos cajas no pueden vender la misma ultima unidad.
#
# POR QUE EXISTE ESTE SCRIPT
# --------------------------
# El enunciado pide impedir que se venda mas cantidad de la que hay en stock, y
# eso ya lo comprueba la prueba de humo. Pero lo comprueba en secuencia: una
# venta, con el stock conocido, contra un sistema en reposo. Ese caso es el
# facil.
#
# El caso dificil es el que ocurre en planta: dos cajas despachando a la vez el
# ultimo envase. Si la comprobacion de stock y el descuento no son atomicos,
# ambas leen "queda 1", ambas aprueban, y el inventario termina en -1. El
# sistema no falla ruidosamente: entrega dos veces un medicamento que solo tenia
# una unidad, y el descuadre se descubre semanas despues en un conteo fisico.
#
# usp_Venta_Registrar valida el stock con UPDLOCK, HOLDLOCK dentro de la misma
# transaccion que inserta el movimiento. Ese bloqueo es lo que impide la
# condicion de carrera. Este script no lo asume: la provoca.
#
# QUE HACE
# --------
#   1. Crea un producto con lote unico y le compra EXACTAMENTE 1 unidad.
#   2. Lanza N ventas de 1 unidad EN PARALELO, todas sobre ese producto.
#   3. Exige que exactamente UNA venda, que el resto reciba 422 por stock
#      insuficiente, y que el stock final sea 0 -nunca negativo-.
#
# El paso 3 es el que importa. Que ninguna falle con error interno tambien se
# comprueba: un 500 significaria que el bloqueo se resuelve por interbloqueo o
# por tiempo de espera agotado, y eso seria otro fallo, no una defensa.
#
# USO
#   bash scripts/prueba-concurrencia.sh
#   VENTAS_PARALELAS=50 bash scripts/prueba-concurrencia.sh
#
# Requiere el ecosistema levantado (docker compose up -d).
# =============================================================================
set -uo pipefail

API="${API:-http://localhost:4000/api/v1}"
PARALELAS="${VENTAS_PARALELAS:-20}"
LOTE="LT-CONC-$(date +%Y%m%d%H%M%S)"
TRABAJO="$(mktemp -d)"
trap 'rm -rf "$TRABAJO"' EXIT

OK=0
FALLA=0

verificar() { # descripcion esperado obtenido
  if [ "$2" = "$3" ]; then
    echo "OK     $1"
    OK=$((OK + 1))
  else
    echo "FALLA  $1 (esperado=$2 obtenido=$3)"
    FALLA=$((FALLA + 1))
  fi
}

json() { # clave  <- lee JSON por entrada estandar
  python -c "import sys,json;print(json.load(sys.stdin).get('$1',''))" 2>/dev/null
}

echo "======================================================="
echo " Concurrencia: venta simultanea de la ultima unidad"
echo " Ventas en paralelo: $PARALELAS"
echo "======================================================="
echo

# -----------------------------------------------------------------------------
# 1. Sesion
# -----------------------------------------------------------------------------
resp=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123$"}')
TOKEN=$(echo "$resp" | json accessToken)

if [ -z "$TOKEN" ]; then
  echo "FALLA  No se pudo iniciar sesion. Respuesta: $resp"
  echo
  echo "Si el mensaje habla del limite de peticiones, espere un minuto:"
  echo "el login admite 5 intentos por minuto y es una defensa, no un fallo."
  exit 1
fi
AUTH="Authorization: Bearer $TOKEN"
echo "OK     Sesion iniciada"
OK=$((OK + 1))

# -----------------------------------------------------------------------------
# 2. Producto con UNA sola unidad
#
# Se crea uno nuevo en cada ejecucion en lugar de reutilizar el catalogo: asi el
# escenario es exacto -stock 1, sin movimientos previos- y el script se puede
# repetir sin re-provisionar la base.
# -----------------------------------------------------------------------------
producto=$(curl -s -H "$AUTH" -H "Content-Type: application/json" -X POST "$API/productos" \
  -d "{\"nombreProducto\":\"Producto Concurrencia $LOTE\",\"nroLote\":\"$LOTE\",\"costo\":10}")
ID_PRODUCTO=$(echo "$producto" | json idProducto)

if [ -z "$ID_PRODUCTO" ]; then
  echo "FALLA  No se pudo crear el producto: $producto"
  exit 1
fi
echo "OK     Producto de prueba creado (id $ID_PRODUCTO)"
OK=$((OK + 1))

compra=$(curl -s -H "$AUTH" -H "Content-Type: application/json" -X POST "$API/compras" \
  -d "{\"lineas\":[{\"idProducto\":$ID_PRODUCTO,\"cantidad\":1,\"precio\":10}]}")
if [ -z "$(echo "$compra" | json idCompraCab)" ]; then
  echo "FALLA  No se pudo comprar la unidad inicial: $compra"
  exit 1
fi
echo "OK     Comprada 1 unidad. El stock es exactamente 1."
OK=$((OK + 1))

# -----------------------------------------------------------------------------
# 3. N ventas simultaneas de esa unica unidad
#
# Se lanzan todas en segundo plano y se espera despues, de modo que compiten de
# verdad. Cada una escribe su codigo de estado y su cuerpo en un archivo propio:
# compartir un archivo entre procesos paralelos mezclaria las lineas.
# -----------------------------------------------------------------------------
echo
echo "-- Lanzando $PARALELAS ventas simultaneas de 1 unidad --"

for i in $(seq 1 "$PARALELAS"); do
  (
    codigo=$(curl -s -o "$TRABAJO/cuerpo-$i" -w "%{http_code}" \
      -H "$AUTH" -H "Content-Type: application/json" -X POST "$API/ventas" \
      -d "{\"lineas\":[{\"idProducto\":$ID_PRODUCTO,\"cantidad\":1}]}")
    echo "$codigo" > "$TRABAJO/codigo-$i"
  ) &
done
wait

exitosas=0
rechazadas=0
errores=0
limitadas=0
otras=0

for i in $(seq 1 "$PARALELAS"); do
  codigo=$(cat "$TRABAJO/codigo-$i" 2>/dev/null)
  case "$codigo" in
    200 | 201) exitosas=$((exitosas + 1)) ;;
    422) rechazadas=$((rechazadas + 1)) ;;
    429) limitadas=$((limitadas + 1)) ;;
    500 | 503) errores=$((errores + 1)) ;;
    *)
      otras=$((otras + 1))
      # Un codigo inesperado no se cuenta en silencio: sin verlo es imposible
      # saber si el invariante fallo o si fallo el propio script.
      echo "   codigo inesperado $codigo -> $(head -c 200 "$TRABAJO/cuerpo-$i" 2>/dev/null)"
      ;;
  esac
done

echo "   ventas aceptadas    : $exitosas"
echo "   rechazos por stock  : $rechazadas"
echo "   frenadas por limite : $limitadas"
echo "   errores internos    : $errores"
echo "   otros codigos       : $otras"
echo

# El limitador de peticiones se cruza en el camino de esta prueba: 20 ventas
# simultaneas mas la preparacion consumen cuota, y si acaba de correr la prueba
# de humo la ventana ya viene medio gastada. No es un fallo del sistema, pero
# invalida el recuento -una venta frenada por el limite ni vendio ni fue
# rechazada por stock-, asi que se aborta con un mensaje claro en vez de
# reportar una falla enganosa.
if [ "$limitadas" -gt 0 ]; then
  echo "AVISO  $limitadas peticiones chocaron con el limite de $((100)) por minuto."
  echo "       El resultado no es concluyente. Espere un minuto y repita:"
  echo "         bash scripts/prueba-concurrencia.sh"
  exit 2
fi

# -----------------------------------------------------------------------------
# 4. Lo que debe cumplirse
# -----------------------------------------------------------------------------
verificar "Exactamente UNA venta se aceptó" "1" "$exitosas"
verificar "Las demás se rechazaron por stock insuficiente" "$((PARALELAS - 1))" "$rechazadas"

# Un 500 significaria que el bloqueo se resolvio por interbloqueo o por espera
# agotada. Serviria para no vender de mas, pero por accidente, no por diseno.
verificar "Ninguna terminó en error interno" "0" "$errores"
verificar "Ningún código inesperado" "0" "$otras"

# El mensaje exacto lo exige el enunciado.
mensaje_ok=0
for i in $(seq 1 "$PARALELAS"); do
  if grep -qi "stock" "$TRABAJO/cuerpo-$i" 2>/dev/null; then
    mensaje_ok=1
    break
  fi
done
verificar "El rechazo explica que el motivo es el stock" "1" "$mensaje_ok"

# -----------------------------------------------------------------------------
# 5. El estado final, que es la prueba definitiva
# -----------------------------------------------------------------------------
kardex=$(curl -s -H "$AUTH" "$API/kardex?tamanoPagina=200")
STOCK_FINAL=$(echo "$kardex" | python -c "
import sys, json
datos = json.load(sys.stdin)['datos']
fila = [f for f in datos if f['nroLote'] == '$LOTE']
print(int(fila[0]['stockActual']) if fila else 'sin-dato')" 2>/dev/null)

verificar "El stock final es 0, nunca negativo" "0" "$STOCK_FINAL"

echo
echo "======================================================="
echo " COMPROBACIONES OK : $OK"
echo " FALLAS            : $FALLA"
echo "======================================================="

if [ "$FALLA" -gt 0 ]; then
  echo
  echo "Una falla aqui significa que el inventario puede quedar descuadrado bajo"
  echo "carga real. En un almacen de medicamentos eso es despachar mas unidades"
  echo "de las que existen."
  exit 1
fi

echo
echo "El bloqueo UPDLOCK, HOLDLOCK de usp_Venta_Registrar sostiene el invariante:"
echo "$PARALELAS cajas compitieron por la misma unidad y solo una la obtuvo."
