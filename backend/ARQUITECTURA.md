# Clean Architecture en el BackEnd

Guía de la estructura del monorepo. Explica **dónde va cada cosa y por qué**, de
modo que quien toque el código sepa en qué capa está trabajando antes de escribir
la primera línea.

---

## La regla de dependencia

Las dependencias del código apuntan **siempre hacia adentro**. Una capa solo
puede conocer a las más internas que ella.

```
        ┌─────────────────────────────────────────────────────┐
        │  4 · INFRAESTRUCTURA                                │
        │     NestJS · main.ts · módulos · driver mssql       │
        │  ┌───────────────────────────────────────────────┐  │
        │  │  3 · ADAPTADORES DE INTERFAZ                  │  │
        │  │     Controladores · Pasarelas · Mapeadores    │  │
        │  │  ┌─────────────────────────────────────────┐  │  │
        │  │  │  2 · APLICACIÓN                         │  │  │
        │  │  │     Casos de uso · Puertos · Modelos    │  │  │
        │  │  │  ┌───────────────────────────────────┐  │  │  │
        │  │  │  │  1 · DOMINIO                      │  │  │  │
        │  │  │  │     Entidades · Objetos de valor  │  │  │  │
        │  │  │  └───────────────────────────────────┘  │  │  │
        │  │  └─────────────────────────────────────────┘  │  │
        │  └───────────────────────────────────────────────┘  │
        └─────────────────────────────────────────────────────┘

                    Las flechas de import van  ←←←
```

**Esta regla no es una convención escrita: está verificada.** Dos pruebas la
comprueban, y hacen falta las dos.

[`test/regla-dependencia.spec.ts`](test/regla-dependencia.spec.ts) recorre el
código fuente, analiza cada `import` y falla si una capa mira hacia afuera o si
el dominio toca un framework.

[`test/superficie-compartida.spec.ts`](test/superficie-compartida.spec.ts) cierra
el hueco que dejaba la anterior. La primera prueba acepta `@hce/compartido`
entero desde cualquier capa —tiene que hacerlo: el paquete exporta símbolos de
las cuatro—, así que un caso de uso podía escribir
`import { MssqlService } from '@hce/compartido'` sin que nada avisara. La
segunda clasifica **cada símbolo exportado** por su capa y verifica los imports
uno a uno.

```bash
npm test -- regla-dependencia superficie-compartida
```

> Esa segunda prueba no es teórica: al escribirla destapó una violación real.
> `MssqlService` estaba en `infraestructura/`, mientras las pasarelas que lo usan
> son capa 3 —tres microservicios importando hacia afuera—. Se corrigió moviendo
> el adaptador a `adaptadores/persistencia/`, que es su sitio: traduce entre lo
> que la aplicación pide y lo que el driver ofrece, y convierte códigos de error
> del motor en excepciones de dominio. El detalle de framework es el paquete
> `mssql` que envuelve, no el envoltorio. En capa 4 queda `MssqlModule`, que solo
> declara cómo construirlo.
>
> Se corrigió el código, no la regla. Es la diferencia entre una prueba de
> arquitectura y una que documenta lo que ya se hacía.

---

## Qué va en cada capa

### Capa 1 · Dominio — `dominio/`

Reglas de negocio de empresa. Lo que sería verdad aunque el sistema no fuera
software.

- `entidades/` — objetos con identidad e invariantes: `Usuario`, `Producto`,
  `ReglasDocumento`
- `objetos-valor/` — sin identidad, inmutables, comparados por valor: `Importe`
- `excepciones/` — errores con significado de negocio

**No importa nada.** Ni NestJS, ni `mssql`, ni `class-validator`. Sus únicas
dependencias permitidas son otros archivos de dominio y la superficie de dominio
de `@hce/compartido`.

> Si necesitas un decorador aquí, estás en la capa equivocada.

### Capa 2 · Aplicación — `aplicacion/`

Reglas de negocio de aplicación: los casos de uso del sistema.

- `puertos/entrada/` — **fronteras de entrada**. Una interfaz por caso de uso.
  El exterior solo puede atravesarlas con `ejecutar(peticion)`.
- `puertos/salida/` — **fronteras de salida**. Lo que el caso de uso necesita del
  mundo: repositorios, hashing, emisión de tokens, registro de eventos.
- `modelos/` — estructuras planas que cruzan las fronteras. **No son entidades.**
- `casos-uso/` — una clase por operación. Reciben sus puertos por constructor.
- `fachadas/` — patrón Facade: agrupan casos de uso tras una interfaz simple.

**Tampoco importa frameworks.** Los casos de uso son clases planas de TypeScript
sin `@Injectable()`. Se instancian en la raíz de composición con `useFactory`.

> Consecuencia práctica: la prueba unitaria de un caso de uso se escribe con dos
> objetos literales y corre en milisegundos, sin contenedor de inyección.

### Capa 3 · Adaptadores de interfaz — `adaptadores/`

Traducen entre el mundo exterior y la aplicación. **Aquí sí** viven los
decoradores de NestJS y el driver de base de datos.

- `controladores/` — reciben mensajes del transporte y llaman a la fachada
- `pasarelas/` — *gateways*: implementan los puertos de salida contra SQL Server,
  bcrypt o JWT. Incluyen los decoradores del patrón Decorator.
- `mapeadores/` — convierten filas de la base al modelo de aplicación
- `dto/` — objetos de transporte con validación y documentación Swagger
- `seguridad/` — guards, estrategias y decoradores de NestJS (solo el Gateway)

### Capa 4 · Infraestructura — `infraestructura/`

Frameworks y punto de entrada del proceso.

- `nestjs/*.module.ts` — **raíz de composición**: el único archivo que decide qué
  implementación concreta satisface cada puerto
- `configuracion/` — lectura y validación de variables de entorno
- `main.ts` — arranque del proceso

---

## Por qué `useFactory` y no `@Injectable()`

Es la decisión que hace la diferencia entre "Clean Architecture de nombre" y
Clean Architecture de verdad.

Poner `@Injectable()` sobre un caso de uso lo ata al contenedor de NestJS: ya no
se puede instanciar sin él, y la capa de aplicación pasa a depender del
framework. Con `useFactory`, los casos de uso son clases planas y todo el
cableado queda confinado a un archivo por servicio.

```typescript
// infraestructura/nestjs/inventario.module.ts — raíz de composición
{
  provide: REGISTRAR_VENTA_PUERTO,
  inject: [INVENTARIO_REPOSITORIO],
  useFactory: (r: InventarioRepositorio): RegistrarVentaPuerto =>
    new RegistrarVentaCasoUso(r, new RegistroNest('RegistrarVenta')),
}
```

**El precio:** el módulo es más verboso.
**La contrapartida:** al leerlo se ve el grafo de dependencias completo del
servicio —incluida la composición de decoradores— sin abrir ninguna otra clase.

---

## Estructura por microservicio

```
apps/ms-inventario/src/
├── dominio/
│   └── entidades/
│       ├── inventario.entidades.ts        Reglas e invariantes del agregado
│       └── inventario.entidades.spec.ts   Pruebas sin infraestructura
├── aplicacion/
│   ├── puertos/
│   │   ├── entrada/inventario.puertos.ts  8 fronteras de entrada
│   │   └── salida/inventario.repositorio.ts  3 interfaces segregadas
│   ├── modelos/inventario.modelos.ts      Peticiones y respuestas
│   ├── casos-uso/                         8 archivos, una clase cada uno
│   └── fachadas/inventario.fachada.ts     Patrón Facade
├── adaptadores/
│   ├── controladores/inventario.controlador.ts
│   ├── pasarelas/
│   │   ├── inventario.mssql.pasarela.ts   Gateway contra SQL Server
│   │   └── inventario.pasarela-trazada.ts Patrón Decorator
│   └── mapeadores/inventario.mapeador.ts  Fila de BD → modelo
└── infraestructura/
    ├── nestjs/inventario.module.ts        Raíz de composición
    └── main.ts                            Arranque del proceso
```

El API Gateway solo tiene las capas 3 y 4, y es correcto: **no posee lógica de
negocio propia**. Es un BFF que traduce HTTP a mensajes RPC y concentra la
seguridad. Sus casos de uso viven en los microservicios.

---

## Hasta dónde llegan los microservicios (y dónde no)

Conviene decirlo sin adornos, porque un revisor lo va a mirar.

**Lo que sí cumple el estándar:**

| Criterio | Estado | Cómo se comprueba |
|---|---|---|
| Un proceso y un contenedor por servicio | Sí | 4 servicios en `docker-compose.yml`, con healthcheck propio |
| Cero código compartido entre servicios | Sí, verificado | `regla-dependencia.spec.ts` falla si un servicio importa de otro; lo común pasa por `@hce/compartido`, que es una dependencia declarada |
| Despliegue y escalado independientes | Sí | Cada uno se construye y arranca por separado |
| Comunicación solo por contrato | Sí | Transporte TCP con patrones de mensaje; ningún servicio llama a las funciones de otro |
| Fallo aislado | Sí | El Gateway aplica timeout y reintento por llamada |

**Lo que no cumple el estándar, y es una decisión consciente:**

Los tres servicios apuntan a la **misma base de datos** `HCE_Insumos` y al mismo
esquema `hce`. Eso es *shared database*, no *database per service*. La propiedad
de los datos queda así:

| Servicio | Cuenta de BD | Escribe | Lee de otro servicio |
|---|---|---|---|
| `ms-auth` | `svc_hce_auth` | `Usuarios` | — |
| `ms-catalogo` | `svc_hce_catalogo` | `Productos` | `vw_StockActual`, que agrega los movimientos de inventario |
| `ms-inventario` | `svc_hce_inventario` | `CompraCab/Det`, `VentaCab/Det`, `MovimientoCab/Det` **y `Productos`** | `Productos` |

La celda incómoda es la última: `usp_Compra_Registrar` hace
`UPDATE p ... FROM hce.Productos AS p` dentro de su transacción. **ms-inventario
escribe en la tabla de ms-catalogo.**

**Por qué se hizo así.** El enunciado exige que registrar una compra sea una sola
operación indivisible: inserta CompraCab y CompraDet, actualiza `Costo` y
`PrecioVenta = Costo * 1.35`, y genera el movimiento de Entrada. Con la base
partida, esas cuatro escrituras caen en dos servicios y la atomicidad se pierde:
haría falta una saga con compensación, y el estado intermedio —una compra
registrada con el precio de venta todavía viejo— sería visible para cualquier
venta concurrente. En un sistema que factura medicamentos, ese intervalo es un
error de cobro real.

Lo mismo con el stock: la venta valida existencias con `UPDLOCK, HOLDLOCK` sobre
los movimientos en la misma transacción que los inserta. Es lo que impide vender
dos veces la última unidad. Con la tabla en otro servicio, esa garantía
desaparece y se sustituye por sobreventa más compensación.

**El precio que se paga.** El esquema es un contrato acoplado: un `ALTER TABLE`
sobre `Productos` obliga a revisar dos servicios, no uno. Está mitigado —pero no
resuelto— porque **ningún servicio emite SQL**: todos pasan por procedimientos
almacenados, así que la superficie compartida es el contrato de los
procedimientos, no el de las tablas. Cambiar una columna sin cambiar la firma del
procedimiento no rompe a nadie.

**Qué haría falta para cerrarlo de verdad**, si el sistema creciera:

1. ~~Permisos separados por servicio~~ — **hecho**, ver abajo.
2. Mover el precio de venta a inventario, o publicar `CompraRegistrada` y que
   catálogo recalcule su propio precio.
3. Aceptar consistencia eventual en el precio, con la regla de negocio explícita
   de qué precio aplica a una venta que llega en mitad de la ventana.

Los dos que quedan son cambios de diseño de producto, no refactors. Por eso el
sistema se entrega con la base compartida y el motivo escrito, en vez de con una
saga a medio hacer.

### Lo que sí se cerró: mínimo privilegio por servicio

La base es compartida, pero el acceso ya no. Cada microservicio tiene su propia
cuenta ([`database/06-seguridad-accesos.sql`](../database/06-seguridad-accesos.sql))
con permiso para ejecutar **únicamente sus procedimientos**:

| Cuenta | Puede ejecutar | No puede |
|---|---|---|
| `svc_hce_auth` | 1 procedimiento | Leer productos, compras ni ventas |
| `svc_hce_catalogo` | 5 de producto | Registrar ventas ni compras |
| `svc_hce_inventario` | 8 de compra/venta/kardex + 2 tipos tabla | Leer credenciales |

**Ninguna tiene un solo permiso sobre tablas o vistas**, y ninguna pertenece a
`db_datareader` ni a ningún otro rol. No hacen falta: procedimientos y tablas
comparten propietario, así que el encadenamiento de propiedad deja que el
procedimiento lea sus tablas en nombre de quien lo llama. Por eso `ms-catalogo`
ve el stock —que sale de los movimientos de inventario— sin tener acceso a
`MovimientoDet`.

Eso apoya la decisión de no emitir SQL desde el código: si un solo procedimiento
usara `sp_executesql`, la cadena se rompería y habría que conceder permisos
sobre las tablas, con lo que este esquema dejaría de sostenerse.

Lo que se gana en concreto: una inyección o un fallo lógico en un servicio ya no
alcanza los datos de los demás. La frontera dejó de ser un acuerdo dentro del
código —`ms-catalogo` intentando registrar una venta ahora recibe el error de
SQL Server, no del programa—.

Las pruebas P11 a P13 de
[`database/99-pruebas-verificacion.sql`](../database/99-pruebas-verificacion.sql)
lo comprueban suplantando cada cuenta con `EXECUTE AS`, y se verificó que
**fallan** al conceder un permiso de más: no documentan lo que ya se hacía.

---

## Dónde poner un cambio

| Si vas a... | Toca... |
|---|---|
| Cambiar cómo se calcula el IGV | `dominio/objetos-valor/importe.vo.ts` (y su equivalente en SQL) |
| Añadir una regla de validación de negocio | La entidad del `dominio/` |
| Añadir una operación nueva del sistema | Un caso de uso en `aplicacion/casos-uso/` + su puerto de entrada |
| Cambiar de SQL Server a PostgreSQL | Una pasarela nueva en `adaptadores/pasarelas/` |
| Exponer la API por gRPC además de REST | Un controlador nuevo en `adaptadores/controladores/` |
| Añadir caché o reintentos al acceso a datos | Un decorador en `adaptadores/pasarelas/` + una línea en el módulo |
| Cambiar una variable de entorno | `infraestructura/configuracion/` |

Si un cambio te obliga a tocar las cuatro capas, probablemente esté mal ubicado.

---

## Comprobaciones

```bash
npm run quality   # la cadena completa, en el orden en que conviene fallar
```

Equivale a:

```bash
npm run format:check   # Prettier
npm run typecheck      # tsc --noEmit, con strict completo
npm run lint:strict    # ESLint, 0 avisos permitidos
npm run test:cov       # 122 pruebas + umbral de cobertura
npm run build          # compila los 4 servicios
```

### La regla de dependencia se comprueba dos veces, a propósito

| Mecanismo | Cuándo avisa | Qué aporta |
|---|---|---|
| `eslint.architecture.mjs` | Mientras se escribe, en el editor | Corrección inmediata, con el mensaje explicando la alternativa correcta |
| `test/regla-dependencia.spec.ts` | Al ejecutar la suite | Impide que llegue a la rama principal aunque alguien ejecute el linter permitiendo avisos |

No es duplicación: son dos momentos distintos del ciclo. Un `eslint-disable`
puede silenciar al primero —de hecho las reglas de arquitectura prohíben
explícitamente esa cadena dentro de un servicio—, pero no al segundo.

### Límites de tamaño

| Ámbito | Límite | Por qué |
|---|---|---|
| Cualquier archivo | **400 líneas** | Un archivo más largo deja de leerse de una sentada |
| Un caso de uso | **120 líneas** | Representa UNA operación de negocio; si no cabe, son dos |
| Una función de caso de uso | **60 líneas** | Un `ejecutar` más largo son varias operaciones disfrazadas de una |

Las líneas en blanco y los comentarios **no cuentan**: documentar una decisión de
diseño no debe penalizar.

El límite de los casos de uso es holgado a propósito. El más grande del sistema
—`iniciar-sesion`, que incluye la defensa contra enumeración por temporización—
ocupa 74 líneas, y el resto van de 15 a 49. Que sobre margen es la señal de que
la regla mide bien: no obliga a comprimir código legible, solo impide que un caso
de uso crezca hasta convertirse en un servicio con tres responsabilidades.

Cuando un caso de uso se acerque al límite, la salida correcta **no es partir el
archivo**: es partir la operación en dos casos de uso que la fachada componga.

### Qué prohíbe cada capa

Las reglas de `eslint.architecture.mjs` bloquean por configuración lo que la
arquitectura ya exige:

- **Dominio**: sin NestJS, sin `mssql`, sin Express, sin `class-validator`, sin
  bcrypt, sin rxjs. Y sin importar de ninguna capa más externa.
- **Aplicación**: lo mismo, **más la prohibición de decoradores**. Esa es la que
  fuerza que los casos de uso sean clases planas cableadas con `useFactory`.
- **Adaptadores**: pueden usar frameworks, pero no importar la raíz de
  composición que los construye (sería un ciclo).
- **Entre microservicios**: ninguno importa código de otro. Lo compartido pasa
  por `@hce/compartido`, que es una dependencia explícita.
