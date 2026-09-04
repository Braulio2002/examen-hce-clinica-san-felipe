/**
 * Reglas de Clean Architecture del BackEnd HCE (CA-HCE v1).
 *
 * Adaptadas de las reglas CA-SIGPRO v1 a este proyecto:
 *   - Nombres de capa en espanol: dominio / aplicacion / adaptadores /
 *     infraestructura, en lugar de domain / application / infrastructure /
 *     presentation.
 *   - Prisma y Fastify sustituidos por el driver `mssql` y Express, que es lo
 *     que este proyecto usa de verdad. Los bloqueos contra Prisma y TypeORM se
 *     conservan de forma deliberada para impedir que se introduzcan sin una
 *     decision explicita.
 *   - Cobertura de la libreria compartida `libs/compartido`, que sigue las
 *     mismas cuatro capas.
 *
 * Complementan a la prueba `test/regla-dependencia.spec.ts`, que verifica lo
 * mismo desde Jest. No es duplicacion: ESLint da el aviso en el editor mientras
 * se escribe, y la prueba impide que el fallo llegue a la rama principal aunque
 * alguien ejecute el linter con avisos permitidos.
 *
 * Nota sobre `import-x/no-restricted-paths`: `target` identifica los archivos
 * sujetos a la restriccion (quien importa) y `from` los origenes que esos
 * archivos no pueden importar.
 *
 * Nota sobre los comodines: `no-restricted-paths` compara la ruta del FICHERO,
 * no la del directorio. Un patron que termina en el segmento `dominio` casa con
 * el directorio y no con `dominio/producto.entidad.ts`. Por eso todas las zonas
 * terminan en `/**`.
 */

/* --- Zonas de capa, con el sufijo obligatorio ------------------------------ */
const CUALQUIER_DOMINIO = './{apps,libs}/**/dominio/**';
const CUALQUIER_APLICACION = './{apps,libs}/**/aplicacion/**';
const CUALQUIER_ADAPTADORES = './{apps,libs}/**/adaptadores/**';
const CUALQUIER_INFRAESTRUCTURA = './{apps,libs}/**/infraestructura/**';

/**
 * Paquetes de persistencia. Solo pueden aparecer en infraestructura y en los
 * adaptadores de persistencia (las pasarelas).
 */
const PAQUETES_PERSISTENCIA = [
  {
    group: ['mssql', 'mssql/*', 'tedious'],
    message:
      'CA-HCE: el driver de SQL Server es un detalle de infraestructura. Declara un puerto ' +
      'en aplicacion/puertos/salida y situa la pasarela en adaptadores/pasarelas.',
  },
  {
    group: ['typeorm', 'typeorm/*', '@nestjs/typeorm', '@prisma/*', 'prisma'],
    message:
      'CA-HCE: este proyecto accede a SQL Server mediante procedimientos almacenados con el ' +
      'driver mssql. Introducir un ORM es una decision de arquitectura, no un import.',
  },
];

/** Paquetes de transporte HTTP. Solo en el API Gateway y en el arranque. */
const PAQUETES_HTTP = [
  {
    group: ['express', 'express/*', '@nestjs/platform-express', 'fastify', '@fastify/*'],
    message:
      'CA-HCE: el transporte HTTP pertenece al API Gateway. El dominio y la aplicacion no ' +
      'conocen HTTP.',
  },
];

/** NestJS es el contenedor de inyeccion: un detalle de la capa mas externa. */
const PAQUETES_NESTJS = [
  {
    group: ['@nestjs/*'],
    message:
      'CA-HCE: esta capa no puede depender de NestJS. Mantenla como TypeScript plano y ' +
      'realiza la composicion con useFactory en infraestructura/nestjs.',
  },
];

/** Librerias de validacion y serializacion: detalle del adaptador de entrada. */
const PAQUETES_VALIDACION = [
  {
    group: ['class-validator', 'class-transformer'],
    message:
      'CA-HCE: la validacion de forma pertenece a los DTO de adaptadores. Las reglas de ' +
      'negocio se validan en el dominio, sin decoradores.',
  },
];

/** Criptografia y sesiones: adaptadores de seguridad, nunca dominio ni aplicacion. */
const PAQUETES_SEGURIDAD = [
  {
    group: ['bcryptjs', 'bcrypt', 'argon2', 'passport', 'passport-*', 'jsonwebtoken'],
    message:
      'CA-HCE: la criptografia es un detalle sustituible. Usa los puertos ServicioHashPuerto ' +
      'y ServicioTokenPuerto, e implementalos en adaptadores/seguridad.',
  },
];

/**
 * Prohibicion transversal: ninguna cadena que desactive reglas dentro del
 * codigo de un servicio.
 *
 * Se repite en cada bloque que tambien use `no-restricted-syntax` porque la
 * configuracion plana de ESLint SUSTITUYE las opciones de una regla en lugar de
 * sumarlas: un bloque posterior que la declare sin este selector lo anularia en
 * silencio.
 */
const SIN_SILENCIAR_REGLAS = {
  selector:
    'Program > :matches(ExpressionStatement, VariableDeclaration) Literal[value=/eslint-disable/]',
  message:
    'CA-HCE: no se desactivan reglas de arquitectura dentro de un servicio. Corrige la causa.',
};

export const configuracionesCleanArchitecture = [
  // ===========================================================================
  // CAPA 1 · DOMINIO
  //
  // La capa mas interna. No conoce frameworks, ni drivers, ni transporte.
  // Es la unica que puede afirmarse que sobrevivira a un cambio de stack.
  // ===========================================================================
  {
    files: ['apps/*/src/dominio/**/*.ts', 'libs/*/src/dominio/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...PAQUETES_NESTJS,
            ...PAQUETES_PERSISTENCIA,
            ...PAQUETES_HTTP,
            ...PAQUETES_VALIDACION,
            ...PAQUETES_SEGURIDAD,
            {
              group: ['rxjs', 'rxjs/*'],
              message:
                'CA-HCE: el dominio expresa sus operaciones con Promise, no con el modelo ' +
                'reactivo del framework de transporte.',
            },
          ],
        },
      ],
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: CUALQUIER_DOMINIO,
              from: CUALQUIER_APLICACION,
              message: 'CA-HCE: el dominio no conoce los casos de uso que lo utilizan.',
            },
            {
              target: CUALQUIER_DOMINIO,
              from: CUALQUIER_ADAPTADORES,
              message:
                'CA-HCE: el dominio no conoce controladores, pasarelas ni mapeadores.',
            },
            {
              target: CUALQUIER_DOMINIO,
              from: CUALQUIER_INFRAESTRUCTURA,
              message: 'CA-HCE: el dominio no conoce modulos de NestJS ni configuracion.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', SIN_SILENCIAR_REGLAS],
    },
  },

  // ===========================================================================
  // CAPA 2 · APLICACION
  //
  // Casos de uso y fronteras. Puede conocer el dominio y nada mas hacia fuera.
  // La prohibicion de NestJS es la que obliga a que los casos de uso sean clases
  // planas cableadas con useFactory: es el rasgo que distingue Clean
  // Architecture real de la version decorativa.
  // ===========================================================================
  {
    files: ['apps/*/src/aplicacion/**/*.ts', 'libs/*/src/aplicacion/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...PAQUETES_NESTJS,
            ...PAQUETES_PERSISTENCIA,
            ...PAQUETES_HTTP,
            ...PAQUETES_VALIDACION,
            ...PAQUETES_SEGURIDAD,
          ],
        },
      ],
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: CUALQUIER_APLICACION,
              from: CUALQUIER_ADAPTADORES,
              message:
                'CA-HCE: un caso de uso no importa su adaptador. Declara un puerto en ' +
                'aplicacion/puertos/salida y deja que infraestructura inyecte la implementacion.',
            },
            {
              target: CUALQUIER_APLICACION,
              from: CUALQUIER_INFRAESTRUCTURA,
              message: 'CA-HCE: la aplicacion no conoce la raiz de composicion.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        SIN_SILENCIAR_REGLAS,
        {
          selector: 'Decorator',
          message:
            'CA-HCE: la capa de aplicacion no lleva decoradores. Los casos de uso son clases ' +
            'planas; la composicion se hace con useFactory en infraestructura/nestjs.',
        },
      ],
    },
  },

  // ===========================================================================
  // CAPA 3 · ADAPTADORES
  //
  // Traducen entre el exterior y la aplicacion. Aqui SI viven los decoradores de
  // NestJS, el driver de base de datos y las librerias de criptografia.
  //
  // Lo unico que se les prohibe es mirar hacia la raiz de composicion: un
  // adaptador que importa el modulo que lo construye crea un ciclo.
  // ===========================================================================
  {
    files: ['apps/*/src/adaptadores/**/*.ts', 'libs/*/src/adaptadores/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: CUALQUIER_ADAPTADORES,
              from: CUALQUIER_INFRAESTRUCTURA,
              message:
                'CA-HCE: un adaptador no importa el modulo que lo construye. Si necesita un ' +
                'valor de configuracion, recibelo por constructor.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', SIN_SILENCIAR_REGLAS],
    },
  },

  // ===========================================================================
  // CAPA 4 · INFRAESTRUCTURA
  //
  // La raiz de composicion y el arranque del proceso. Puede importar cualquier
  // capa: ese es su cometido. La unica regla es que no se silencien reglas.
  // ===========================================================================
  {
    files: ['apps/*/src/infraestructura/**/*.ts', 'libs/*/src/infraestructura/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', SIN_SILENCIAR_REGLAS],
    },
  },

  // ===========================================================================
  // El API Gateway no tiene dominio ni casos de uso propios.
  //
  // Es un BFF: traduce HTTP a mensajes RPC y concentra la seguridad. Sus casos
  // de uso viven en los microservicios. Que no tenga carpetas `dominio/` ni
  // `aplicacion/` no es un olvido, es la consecuencia de esa decision.
  //
  // Se le permite Express porque es quien realmente expone el transporte HTTP.
  // ===========================================================================
  {
    files: ['apps/api-gateway/src/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './apps/api-gateway/src/adaptadores/**',
              from: './apps/ms-*/src/**',
              message:
                'CA-HCE: el Gateway no importa codigo de un microservicio. Se comunica por ' +
                'mensajes TCP usando los patrones de @hce/compartido.',
            },
          ],
        },
      ],
    },
  },

  // ===========================================================================
  // Ningun microservicio importa codigo de otro.
  //
  // Compartir una clase entre dos microservicios los convierte en un monolito
  // desplegado en varios procesos: lo peor de ambos mundos. Lo que se comparte
  // pasa por `libs/compartido`, que es una dependencia explicita y versionada.
  // ===========================================================================
  {
    files: ['apps/ms-*/src/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './apps/ms-auth/src/**',
              from: './apps/ms-catalogo/src/**',
              message:
                'CA-HCE: ms-auth no importa codigo de ms-catalogo. Usa @hce/compartido.',
            },
            {
              target: './apps/ms-auth/src/**',
              from: './apps/ms-inventario/src/**',
              message:
                'CA-HCE: ms-auth no importa codigo de ms-inventario. Usa @hce/compartido.',
            },
            {
              target: './apps/ms-catalogo/src/**',
              from: './apps/ms-auth/src/**',
              message:
                'CA-HCE: ms-catalogo no importa codigo de ms-auth. Usa @hce/compartido.',
            },
            {
              target: './apps/ms-catalogo/src/**',
              from: './apps/ms-inventario/src/**',
              message:
                'CA-HCE: ms-catalogo no importa codigo de ms-inventario. Usa @hce/compartido.',
            },
            {
              target: './apps/ms-inventario/src/**',
              from: './apps/ms-auth/src/**',
              message:
                'CA-HCE: ms-inventario no importa codigo de ms-auth. Usa @hce/compartido.',
            },
            {
              target: './apps/ms-inventario/src/**',
              from: './apps/ms-catalogo/src/**',
              message:
                'CA-HCE: ms-inventario no importa codigo de ms-catalogo. Usa @hce/compartido.',
            },
          ],
        },
      ],
    },
  },
];
