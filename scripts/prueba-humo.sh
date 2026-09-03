#!/bin/bash
# =============================================================================
# EXAMEN TECNICO - ESPECIALISTA DESARROLLO HCE
# Prueba de humo end-to-end contra el API Gateway.
#
# Verifica de un tiron las reglas de negocio y los controles de seguridad que
# pide el enunciado: JWT de 30 minutos, cookie HttpOnly, CORS restringido,
# rate limit, cabeceras de seguridad, calculo de importes, actualizacion de
# precio por compra, validacion de stock en la venta y trazabilidad del Kardex.
#
# Uso:
#     bash scripts/prueba-humo.sh
#
# Requisitos: el ecosistema levantado (docker compose up) y python en el PATH
# para leer JSON.
#
# NOTA: la prueba 15 agota a proposito el rate limit del login (5 intentos por
# minuto). Si vuelve a ejecutar el script inmediatamente, espere unos 60
# segundos o los primeros casos fallaran con 429.
# =============================================================================
# Prueba de humo end-to-end contra el API Gateway.
API="http://localhost:4000/api/v1"
OK=0; FALLA=0

verificar() { # nombre esperado obtenido
  if [ "$2" = "$3" ]; then echo "OK     $1"; OK=$((OK+1));
  else echo "FALLA  $1 (esperado=$2 obtenido=$3)"; FALLA=$((FALLA+1)); fi
}

echo "== 1. Acceso sin token =="
code=$(curl -s -o /dev/null -w "%{http_code}" "$API/productos")
verificar "GET /productos sin token devuelve 401" "401" "$code"

echo
echo "== 2. Login con credenciales invalidas =="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/login" \
  -H "Content-Type: application/json" -d '{"username":"admin","password":"incorrecta"}')
verificar "Login invalido devuelve 401" "401" "$code"

echo
echo "== 3. Login valido =="
resp=$(curl -s -c /tmp/cookies.txt -X POST "$API/auth/login" \
  -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin123$"}')
TOKEN=$(echo "$resp" | python -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
EXP=$(echo "$resp" | python -c "import sys,json; print(json.load(sys.stdin).get('expiraEnSegundos',''))" 2>/dev/null)
if [ -n "$TOKEN" ]; then echo "OK     Login devuelve accessToken"; OK=$((OK+1));
else echo "FALLA  Login no devolvio token. Respuesta: $resp"; FALLA=$((FALLA+1)); fi
verificar "El token expira en 1800 s (30 min)" "1800" "$EXP"
if grep -qi "hce_access_token" /tmp/cookies.txt; then echo "OK     Se establecio la cookie HttpOnly"; OK=$((OK+1));
else echo "FALLA  No se establecio la cookie"; FALLA=$((FALLA+1)); fi

AUTH="Authorization: Bearer $TOKEN"

echo
echo "== 4. Kardex inicial =="
kardex=$(curl -s -H "$AUTH" "$API/kardex?tamanoPagina=100")
STOCK_INI=$(echo "$kardex" | python -c "
import sys,json
d=json.load(sys.stdin)
f=[x for x in d['datos'] if x['nroLote']=='LT-2026-0001'][0]
print(int(f['stockActual']))" 2>/dev/null)
verificar "Stock inicial del Paracetamol es 680" "680" "$STOCK_INI"

echo
echo "== 5. Registrar producto nuevo =="
nuevo=$(curl -s -H "$AUTH" -H "Content-Type: application/json" -X POST "$API/productos" \
  -d '{"nombreProducto":"Ketorolaco 30 mg Ampolla","nroLote":"LT-2026-9001","costo":2.0}')
ID_NUEVO=$(echo "$nuevo" | python -c "import sys,json; print(json.load(sys.stdin).get('idProducto',''))" 2>/dev/null)
PV_NUEVO=$(echo "$nuevo" | python -c "import sys,json; print(json.load(sys.stdin).get('precioVenta',''))" 2>/dev/null)
if [ -n "$ID_NUEVO" ]; then echo "OK     Producto creado con id $ID_NUEVO"; OK=$((OK+1));
else echo "FALLA  No se creo el producto: $nuevo"; FALLA=$((FALLA+1)); fi
verificar "PrecioVenta calculado como costo*1.35 = 2.70" "2.7" "$PV_NUEVO"

echo
echo "== 6. Producto duplicado =="
code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" -H "Content-Type: application/json" \
  -X POST "$API/productos" \
  -d '{"nombreProducto":"Ketorolaco 30 mg Ampolla","nroLote":"LT-2026-9001","costo":2.0}')
verificar "Producto duplicado devuelve 409" "409" "$code"

echo
echo "== 7. Registrar compra =="
compra=$(curl -s -H "$AUTH" -H "Content-Type: application/json" -X POST "$API/compras" \
  -d "{\"lineas\":[{\"idProducto\":$ID_NUEVO,\"cantidad\":50,\"precio\":2.5}]}")
ID_COMPRA=$(echo "$compra" | python -c "import sys,json; print(json.load(sys.stdin).get('idCompraCab',''))" 2>/dev/null)
SUB=$(echo "$compra" | python -c "import sys,json; print(json.load(sys.stdin).get('subTotal',''))" 2>/dev/null)
IGV=$(echo "$compra" | python -c "import sys,json; print(json.load(sys.stdin).get('igv',''))" 2>/dev/null)
if [ -n "$ID_COMPRA" ]; then echo "OK     Compra registrada con id $ID_COMPRA"; OK=$((OK+1));
else echo "FALLA  No se registro la compra: $compra"; FALLA=$((FALLA+1)); fi
verificar "SubTotal de la compra = 50*2.5 = 125" "125" "$SUB"
verificar "IGV segun enunciado = 125*1.18 = 147.5" "147.5" "$IGV"

echo
echo "== 8. La compra actualizo costo y precio de venta =="
prod=$(curl -s -H "$AUTH" "$API/productos/$ID_NUEVO")
COSTO=$(echo "$prod" | python -c "import sys,json; print(json.load(sys.stdin).get('costo',''))" 2>/dev/null)
PV=$(echo "$prod" | python -c "import sys,json; print(json.load(sys.stdin).get('precioVenta',''))" 2>/dev/null)
STOCK=$(echo "$prod" | python -c "import sys,json; print(int(json.load(sys.stdin).get('stockActual',0)))" 2>/dev/null)
verificar "Costo actualizado al de la compra (2.5)" "2.5" "$COSTO"
verificar "PrecioVenta recalculado = 2.5*1.35 = 3.375" "3.375" "$PV"
verificar "Stock tras la compra = 50" "50" "$STOCK"

echo
echo "== 9. Registrar venta valida =="
venta=$(curl -s -H "$AUTH" -H "Content-Type: application/json" -X POST "$API/ventas" \
  -d "{\"lineas\":[{\"idProducto\":$ID_NUEVO,\"cantidad\":10}]}")
ID_VENTA=$(echo "$venta" | python -c "import sys,json; print(json.load(sys.stdin).get('idVentaCab',''))" 2>/dev/null)
PRECIO_VENTA=$(echo "$venta" | python -c "import sys,json; print(json.load(sys.stdin)['detalle'][0]['precio'])" 2>/dev/null)
if [ -n "$ID_VENTA" ]; then echo "OK     Venta registrada con id $ID_VENTA"; OK=$((OK+1));
else echo "FALLA  No se registro la venta: $venta"; FALLA=$((FALLA+1)); fi
verificar "La venta usa el precio del servidor (3.375)" "3.375" "$PRECIO_VENTA"

echo
echo "== 10. Venta que supera el stock =="
resp=$(curl -s -w "\n%{http_code}" -H "$AUTH" -H "Content-Type: application/json" -X POST "$API/ventas" \
  -d "{\"lineas\":[{\"idProducto\":$ID_NUEVO,\"cantidad\":9999}]}")
code=$(echo "$resp" | tail -1)
cuerpo=$(echo "$resp" | head -n -1)
verificar "Venta sobre stock devuelve 422" "422" "$code"
if echo "$cuerpo" | grep -qi "stock insuficiente"; then echo "OK     El mensaje explica el stock insuficiente"; OK=$((OK+1));
else echo "FALLA  Mensaje inesperado: $cuerpo"; FALLA=$((FALLA+1)); fi

echo
echo "== 11. Kardex del producto =="
movs=$(curl -s -H "$AUTH" "$API/kardex/producto/$ID_NUEVO/movimientos")
NUM_MOVS=$(echo "$movs" | python -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
TIPOS=$(echo "$movs" | python -c "import sys,json; print(','.join(sorted(m['tipoMovimiento'] for m in json.load(sys.stdin))))" 2>/dev/null)
verificar "El producto tiene 2 movimientos" "2" "$NUM_MOVS"
verificar "Los movimientos son Entrada y Salida" "Entrada,Salida" "$TIPOS"

STOCK_FIN=$(curl -s -H "$AUTH" "$API/productos/$ID_NUEVO" | python -c "import sys,json; print(int(json.load(sys.stdin)['stockActual']))" 2>/dev/null)
verificar "Stock final = 50 - 10 = 40" "40" "$STOCK_FIN"

echo
echo "== 12. Validacion de entrada =="
code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" -H "Content-Type: application/json" \
  -X POST "$API/ventas" -d '{"lineas":[]}')
verificar "Venta sin lineas devuelve 400" "400" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" -H "Content-Type: application/json" \
  -X POST "$API/productos" -d '{"nombreProducto":"X","nroLote":"Y","costo":-5}')
verificar "Costo negativo devuelve 400" "400" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" -H "Content-Type: application/json" \
  -X POST "$API/productos" -d '{"nombreProducto":"X","nroLote":"Y","costo":1,"campoIntruso":"x"}')
verificar "Campo no declarado devuelve 400 (anti mass-assignment)" "400" "$code"

echo
echo "== 13. Autorizacion por rol =="
tk=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d '{"username":"consulta","password":"Consulta123$"}' \
  | python -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $tk" \
  -H "Content-Type: application/json" -X POST "$API/ventas" \
  -d "{\"lineas\":[{\"idProducto\":$ID_NUEVO,\"cantidad\":1}]}")
verificar "El rol CONSULTA no puede vender (403)" "403" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $tk" "$API/kardex")
verificar "El rol CONSULTA si puede leer el Kardex (200)" "200" "$code"

echo
echo "== 14. Token manipulado =="
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.firma_falsa" "$API/kardex")
verificar "Token con firma invalida devuelve 401" "401" "$code"

echo
echo "== 15. Rate limit del login =="
for i in $(seq 1 7); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/login" \
    -H "Content-Type: application/json" -d '{"username":"admin","password":"mala"}')
done
verificar "Tras varios intentos el login devuelve 429" "429" "$code"

echo
echo "== 16. Swagger =="
code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:4000/api/docs")
verificar "Swagger disponible en /api/docs" "200" "$code"

echo
echo "== 17. Cabeceras de seguridad =="
heads=$(curl -s -D - -o /dev/null "$API/salud")
echo "$heads" | grep -qi "x-content-type-options: nosniff" && { echo "OK     X-Content-Type-Options: nosniff"; OK=$((OK+1)); } || { echo "FALLA  Falta nosniff"; FALLA=$((FALLA+1)); }
echo "$heads" | grep -qi "x-frame-options: DENY" && { echo "OK     X-Frame-Options: DENY"; OK=$((OK+1)); } || { echo "FALLA  Falta X-Frame-Options"; FALLA=$((FALLA+1)); }
echo "$heads" | grep -qi "content-security-policy" && { echo "OK     Content-Security-Policy presente"; OK=$((OK+1)); } || { echo "FALLA  Falta CSP"; FALLA=$((FALLA+1)); }
echo "$heads" | grep -qi "x-powered-by" && { echo "FALLA  Se filtra X-Powered-By"; FALLA=$((FALLA+1)); } || { echo "OK     No se expone X-Powered-By"; OK=$((OK+1)); }

echo
echo "== 18. CORS restringido =="
origen=$(curl -s -D - -o /dev/null -H "Origin: http://sitio-malicioso.com" "$API/salud" | grep -i "access-control-allow-origin" | tr -d '\r')
if [ -z "$origen" ]; then echo "OK     Origen no autorizado no recibe cabecera CORS"; OK=$((OK+1));
else echo "FALLA  Se permitio un origen no autorizado: $origen"; FALLA=$((FALLA+1)); fi
origen=$(curl -s -D - -o /dev/null -H "Origin: http://localhost:3000" "$API/salud" | grep -i "access-control-allow-origin" | tr -d '\r')
if echo "$origen" | grep -q "localhost:3000"; then echo "OK     El origen del FrontEnd si esta permitido"; OK=$((OK+1));
else echo "FALLA  No se permitio el origen del FrontEnd"; FALLA=$((FALLA+1)); fi

echo
echo "======================================="
echo " PRUEBAS OK    : $OK"
echo " PRUEBAS FALLA : $FALLA"
echo "======================================="
[ "$FALLA" -eq 0 ]
