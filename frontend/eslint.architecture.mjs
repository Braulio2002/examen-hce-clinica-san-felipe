/**
 * Reglas de arquitectura del microfront HCE (FA-HCE v1).
 *
 * Adaptadas de FA-SIGPRO v1. Aqui la frontera que importa no es la de capas
 * —el FrontEnd no tiene dominio propio— sino la de ZONAS: cada zona del
 * microfront se construye y se despliega por separado, y esa autonomia solo es
 * real si el codigo la respeta.
 *
 * Si una zona importa un archivo de la otra, el empaquetador lo incluye en su
 * bundle y las dos dejan de ser independientes: se convierten en un monolito
 * repartido en dos contenedores, con toda la complejidad del despliegue
 * separado y ninguna de sus ventajas. Lo que se comparte pasa por los paquetes
 * de workspace `@hce/ui` y `@hce/api-cliente`, que son dependencias explicitas
 * y versionadas.
 *
 * Nota sobre `import-x/no-restricted-paths`: `target` identifica los archivos
 * sujetos a la restriccion (quien importa) y `from` los origenes prohibidos.
 * Los patrones comparan la ruta del FICHERO, por eso terminan en `/**`.
 */

const ZONA_SHELL = './apps/shell/**';
const ZONA_INVENTARIO = './apps/inventario/**';
const PAQUETES_COMPARTIDOS = './paquetes/**';

export const configuracionesMicrofront = [
  // ===========================================================================
  // Las zonas no se importan entre si.
  // ===========================================================================
  {
    files: ['apps/*/src/**/*.{ts,tsx}'],
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: ZONA_SHELL,
              from: ZONA_INVENTARIO,
              message:
                'FA-HCE: la shell no importa codigo de la zona de inventario. Son aplicaciones ' +
                'independientes: lo comun va en @hce/ui o @hce/api-cliente.',
            },
            {
              target: ZONA_INVENTARIO,
              from: ZONA_SHELL,
              message:
                'FA-HCE: la zona de inventario no importa codigo de la shell. Son aplicaciones ' +
                'independientes: lo comun va en @hce/ui o @hce/api-cliente.',
            },
          ],
        },
      ],
    },
  },

  // ===========================================================================
  // Los paquetes compartidos no dependen de ninguna aplicacion.
  //
  // Un paquete que importa de una zona invierte la dependencia y deja de ser
  // reutilizable: la otra zona arrastraria codigo que no le corresponde.
  // Tampoco pueden usar `next/*`: eso los ataria al framework y ambos paquetes
  // deben poder consumirse desde cualquier cliente.
  // ===========================================================================
  {
    files: ['paquetes/*/src/**/*.{ts,tsx}'],
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: PAQUETES_COMPARTIDOS,
              from: './apps/**',
              message:
                'FA-HCE: un paquete compartido no depende de una aplicacion. Invierte la ' +
                'dependencia: recibe lo que necesite por props o por parametro.',
            },
          ],
        },
      ],
    },
  },

  // ===========================================================================
  // El cliente de API no conoce React ni Next.
  //
  // `@hce/api-cliente` es TypeScript plano: tipos, cliente HTTP con
  // interceptores y calculos de presentacion. Que no dependa de React es lo que
  // permite reutilizarlo desde una prueba, desde un script de Node o desde un
  // cliente distinto sin arrastrar el arbol de componentes.
  // ===========================================================================
  {
    files: ['paquetes/api-cliente/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'next', 'next/*'],
              message:
                'FA-HCE: el cliente de API es TypeScript plano. Si necesitas estado de React, ' +
                'construyelo encima en @hce/ui o en la propia zona.',
            },
          ],
        },
      ],
    },
  },

  // ===========================================================================
  // El token de sesion nunca se guarda en almacenamiento del navegador.
  //
  // El JWT viaja en una cookie HttpOnly precisamente para que JavaScript no
  // pueda leerlo: escribirlo en localStorage o sessionStorage anularia esa
  // proteccion y devolveria la aplicacion al escenario que se queria evitar,
  // en el que un XSS puede exfiltrar la sesion.
  //
  // La regla es sintactica y cubre todo el FrontEnd, no solo el modulo de
  // sesion: el riesgo es que alguien lo haga "temporalmente" en cualquier sitio.
  // ===========================================================================
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'paquetes/*/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[object.name=/^(localStorage|sessionStorage)$/][property.name="setItem"]',
          message:
            'FA-HCE: el token de sesion vive en una cookie HttpOnly y no puede escribirse en ' +
            'almacenamiento accesible desde JavaScript (mitigacion de XSS).',
        },
        {
          selector: 'MemberExpression[object.name="document"][property.name="cookie"]',
          message:
            'FA-HCE: no se manipula document.cookie. La cookie de sesion es HttpOnly y la ' +
            'gestiona el API Gateway.',
        },
      ],
    },
  },
];
