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

**Esta regla no es una convención escrita: está verificada.** La prueba
[`test/regla-dependencia.spec.ts`](test/regla-dependencia.spec.ts) recorre el
código fuente, analiza cada `import` y falla si una capa mira hacia afuera o si
el dominio toca un framework.

```bash
npm test -- regla-dependencia
```

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
npm run test:cov       # 117 pruebas + umbral de cobertura
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
