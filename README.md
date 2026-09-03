# Sistema de Gestión de Insumos Médicos — HCE

Solución al examen técnico para **Especialista de Desarrollo TI — HCE**,
Clínica San Felipe.

Control de medicamentos e insumos médicos en atenciones clínicas: registro de
compras, despacho en ventas y trazabilidad completa mediante Kardex.

**Stack:** NestJS (microservicios) · Next.js (microfront) · SQL Server · Docker

---

## Puesta en marcha

Requisitos: **Docker Desktop** con Docker Compose v2. Nada más — no hace falta
Node ni SQL Server instalados en el equipo.

```bash
git clone <URL-DEL-REPOSITORIO>
cd examen-hce-clinica-san-felipe
cp .env.example .env
docker compose up --build
```

La primera construcción descarga la imagen de SQL Server (~1.5 GB) y tarda
varios minutos. Las siguientes son casi instantáneas.

Cuando `api-gateway` aparezca como `healthy`, todo está listo:

| Recurso | URL | Notas |
|---|---|---|
| **Aplicación web** | http://localhost:3000 | Punto de entrada |
| **Swagger** | http://localhost:4000/api/docs | Documentación interactiva |
| **API** | http://localhost:4000/api/v1 | Base de todos los endpoints |
| **Salud del Gateway** | http://localhost:4000/api/v1/salud | Usado por el healthcheck |
| **SQL Server** | `localhost,14330` | Usuario `sa`, contraseña del `.env` |

### Usuarios de demostración

| Usuario | Contraseña | Rol | Permisos |
|---|---|---|---|
| `admin` | `Admin123$` | ADMIN | Acceso total |
| `farmacia` | `Farmacia123$` | FARMACIA | Compras, ventas y productos |
| `consulta` | `Consulta123$` | CONSULTA | Solo lectura |

La base arranca con 12 insumos médicos, dos compras y una venta ya registradas,
de modo que el Kardex tiene movimientos desde el primer minuto.

### Antes de un despliegue real

El `.env.example` trae un `JWT_SECRET` de marcador. **Genere uno propio:**

```bash
openssl rand -base64 48
```

---

## Verificación

### Pruebas unitarias del dominio (29 casos)

```bash
cd backend && npm test
```

Cubren el value object `Importe` —la fórmula de importes del enunciado y el
margen de 1.35— y las reglas del agregado de inventario. Corren sin base de
datos ni contenedores: es la ventaja concreta de mantener el dominio aislado.

### Pruebas de la API (36 verificaciones end-to-end)

```bash
bash scripts/prueba-humo.sh
```

Comprueba, contra el sistema en ejecución: JWT de 30 minutos, cookie HttpOnly,
CORS restringido, rate limiting, cabeceras de seguridad, autorización por rol,
cálculo de importes, actualización de precio por compra, validación de stock en
la venta y coherencia del Kardex.

> La prueba 15 agota deliberadamente el límite de intentos de login (5 por
> minuto). Si la ejecuta dos veces seguidas, espere ~60 segundos.

### Pruebas de base de datos (10 reglas de negocio)

```bash
docker compose exec sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C \
  -i /scripts/99-pruebas-verificacion.sql
```

### Colección de Postman

Importe `postman/HCE-Insumos.postman_collection.json` junto con
`postman/HCE-Local.postman_environment.json`. La petición de login guarda el
token automáticamente en la variable de entorno; el resto de peticiones lo
reutilizan.

---

## Qué hace el sistema

### Registrar compra

Permite cargar varias líneas y crear un producto desde un modal si no existe.
Al confirmar, el servidor ejecuta **una sola transacción**:

1. Graba `CompraCab` y `CompraDet`.
2. Actualiza el costo del producto y recalcula su precio de venta
   (`PrecioVenta = Costo × 1.35`).
3. Genera el movimiento de tipo **Entrada** en el Kardex.

Si cualquier paso falla, no se graba nada.

### Registrar venta

Muestra por producto el precio de venta y el **stock disponible**, calculado
desde la tabla de movimientos. No permite guardar si alguna cantidad supera el
stock: la fila se marca y aparece el mensaje *"la cantidad no debe ser mayor al
stock"*.

La validación definitiva ocurre en el servidor, dentro de la transacción y con
bloqueo, de modo que dos cajas vendiendo el mismo insumo a la vez no pueden
provocar sobreventa.

### Kardex

Grilla con identificador, nombre, stock actual, costo y precio de venta. Cada
fila abre un modal con los movimientos del producto: fecha, tipo de movimiento,
cantidad y **saldo acumulado**.

---

## Arquitectura

```
Navegador
    │
    ├──► front-shell :3000 ──(rewrite /inventario/*)──► front-inventario
    │         Login · Inicio · Productos                Compras · Ventas · Kardex
    │
    └──► api-gateway :4000
              JWT · Roles · Rate limit · CORS · Helmet · Swagger
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    ms-auth    ms-catalogo  ms-inventario      (TCP interno, sin puertos públicos)
        └───────────┼───────────┘
                    ▼
              SQL Server
     Procedimientos almacenados · Triggers de auditoría
```

**Backend:** monorepo NestJS con tres microservicios y un API Gateway. Cada
servicio sigue **Arquitectura Hexagonal**: el dominio no importa NestJS ni el
driver de base de datos.

**Frontend:** microfront con **Next.js Multi-Zones**. Dos aplicaciones
independientes que se construyen y despliegan por separado, compuestas en una
sola URL. Comparten diseño y cliente HTTP a través de paquetes de workspace.

**Base de datos:** toda la lógica transaccional vive en procedimientos
almacenados. El stock **no se almacena**: se deriva siempre de la tabla de
movimientos, que es la única fuente de verdad de la existencia física.

Detalle completo, diagramas y justificaciones:
- [Evaluación teórica](docs/01-evaluacion-teorica.md) — API REST, monolito vs.
  microservicios, BFF, DDD
- [Arquitectura](docs/02-arquitectura.md) — diagramas, hexagonal en salud,
  patrones, seguridad, modelo de datos

---

## Seguridad

El enunciado pide un mínimo de dos mecanismos. Se implementaron seis:

| Mecanismo | Implementación |
|---|---|
| **JWT de 30 minutos** | HS256 con `issuer` y `audience` validados |
| **Cookie HttpOnly** | Inaccesible desde JavaScript; mitiga robo de token por XSS |
| **Rate limiting** | 100 peticiones/min general, 5/min en login |
| **CORS restringido** | Lista blanca; el comodín `*` se rechaza al arrancar |
| **Cabeceras de seguridad** | Helmet, `X-Content-Type-Options: nosniff`, CSP, `X-Frame-Options: DENY` |
| **Autorización por rol** | Guard global con roles ADMIN / FARMACIA / CONSULTA |

Además: bcrypt para contraseñas, defensa contra enumeración de usuarios por
temporización, parámetros tipados en todo acceso a SQL, rechazo de campos no
declarados en los DTOs, contenedores sin privilegios y bitácora de auditoría
inmutable.

Las limitaciones conocidas están declaradas en el
[documento de arquitectura](docs/02-arquitectura.md#54-limitaciones-conocidas).

---

## Estructura

```
├── docker-compose.yml         Levanta todo el ecosistema
├── .env.example               Plantilla de configuración
├── database/                  Esquema, triggers, procedimientos, seed y pruebas
├── backend/                   Monorepo NestJS (gateway + 3 microservicios)
├── frontend/                  Microfront Next.js (2 zonas + 2 paquetes)
├── postman/                   Colección de la API
├── scripts/prueba-humo.sh     36 verificaciones end-to-end
└── docs/                      Evaluación teórica y arquitectura
```

---

## Desarrollo sin Docker

Requiere Node 22+ y una instancia de SQL Server accesible.

```bash
# 1. Base de datos: ejecute en orden los scripts de database/
#    01-schema.sql → 02-triggers-auditoria.sql → 03-stored-procedures.sql → 05-seed.sql

# 2. Backend
cd backend
npm install
cp .env.example .env      # ajuste DB_HOST, DB_PORT y credenciales
npm run build
npm run start:dev         # levanta los 4 servicios en paralelo

# 3. Frontend
cd ../frontend
npm install
npm run dev               # shell en :3000, zona de inventario en :3001
```

---

## Observación sobre el cálculo del IGV

La sección 1.2.2 del enunciado define:

```
Subtotal = Cantidad × Precio Venta
Igv      = Cantidad × Precio Venta × 1.18
Total    = Subtotal + Igv
```

**Se implementó literalmente**, y hay una prueba automatizada que lo verifica.

Queda registrada la observación técnica: con esa fórmula el IGV resulta ser el
118 % del subtotal y el total el 218 %, mientras que el IGV peruano vigente es
el 18 % del valor de venta (`Igv = SubTotal × 0.18`, `Total = SubTotal × 1.18`).

La fórmula está centralizada en un único lugar por capa —el value object
[`Importe`](backend/libs/compartido/src/dominio/value-objects/importe.vo.ts) y la
función SQL `hce.fn_CalcularImportes`— precisamente para que corregir el
criterio sea un cambio mínimo.

---

## Comandos útiles

```bash
# Ver el estado de los servicios
docker compose ps

# Seguir los logs de un servicio
docker compose logs -f ms-inventario

# Reiniciar desde cero, borrando los datos
docker compose down -v && docker compose up --build

# Conectarse a la base
docker compose exec sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -d HCE_Insumos
```
