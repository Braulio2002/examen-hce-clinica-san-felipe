import js from '@eslint/js';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import prettierConfig from 'eslint-config-prettier';
import { importX } from 'eslint-plugin-import-x';
import jest from 'eslint-plugin-jest';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

import { configuracionesCleanArchitecture } from './eslint.architecture.mjs';

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

/**
 * Reglas SonarJS adicionales a las recomendadas.
 *
 * Se filtran contra el conjunto de reglas realmente publicado por el plugin:
 * asi una actualizacion que renombre o retire una regla no rompe el arranque de
 * ESLint con "Definition for rule not found". La lista queda visible en el
 * codigo, de modo que la desaparicion de una regla se detecta al revisarla.
 */
const reglasSonarExtra = {
  'sonarjs/cognitive-complexity': ['error', 15],
  'sonarjs/no-nested-conditional': 'error',
  'sonarjs/no-duplicate-string': ['warn', { threshold: 3 }],
  'sonarjs/no-identical-expressions': 'error',
  'sonarjs/no-identical-conditions': 'error',
  'sonarjs/no-duplicated-branches': 'error',
  'sonarjs/no-all-duplicated-branches': 'error',
  'sonarjs/no-collapsible-if': 'error',
  'sonarjs/no-redundant-jump': 'error',
  'sonarjs/no-nested-switch': 'error',
  'sonarjs/no-nested-template-literals': 'error',
  'sonarjs/prefer-immediate-return': 'warn',
  'sonarjs/prefer-single-boolean-return': 'warn',
  'sonarjs/no-useless-catch': 'error',
  'sonarjs/no-empty-collection': 'error',
  'sonarjs/no-element-overwrite': 'error',
  'sonarjs/no-extra-arguments': 'error',
  'sonarjs/no-ignored-return': 'error',
  'sonarjs/no-unused-collection': 'error',
  'sonarjs/redundant-type-aliases': 'error',
  'sonarjs/no-redundant-optional': 'error',
};

const reglasUnicornExtra = {
  'unicorn/no-useless-promise-resolve-reject': 'error',
  'unicorn/prefer-string-replace-all': 'error',
  'unicorn/prefer-structured-clone': 'warn',
  'unicorn/no-object-as-default-parameter': 'error',
  'unicorn/consistent-function-scoping': 'error',
  'unicorn/prefer-array-find': 'error',
  'unicorn/prefer-array-some': 'error',
  'unicorn/prefer-array-flat': 'warn',
  'unicorn/prefer-includes': 'error',
  'unicorn/prefer-logical-operator-over-ternary': 'warn',
  'unicorn/no-await-expression-member': 'error',
  'unicorn/no-unreadable-array-destructuring': 'error',
  'unicorn/no-useless-fallback-in-spread': 'error',
  'unicorn/prefer-node-protocol': 'error',
  'unicorn/throw-new-error': 'error',
};

/** Conserva unicamente las reglas que existen en la version instalada. */
function reglasDisponibles(candidatas, plugin, prefijo) {
  return Object.fromEntries(
    Object.entries(candidatas).filter(([nombre]) =>
      Boolean(plugin.rules?.[nombre.replace(`${prefijo}/`, '')]),
    ),
  );
}

const sonarExtraActivas = reglasDisponibles(reglasSonarExtra, sonarjs, 'sonarjs');
const unicornExtraActivas = reglasDisponibles(reglasUnicornExtra, unicorn, 'unicorn');

/**
 * Relajaciones aplicables a los archivos de prueba.
 *
 * Una prueba manipula deliberadamente datos malformados y dobles parciales; las
 * reglas de seguridad de tipos que protegen el codigo de produccion generan ahi
 * ruido sin aportar valor. La logica de produccion no se beneficia de ninguna
 * de estas excepciones.
 */
const relajacionesPruebas = {
  'jest/no-disabled-tests': 'warn',
  'jest/no-focused-tests': 'error',
  'jest/no-identical-title': 'error',
  'jest/valid-expect': 'error',
  'jest/prefer-to-have-length': 'warn',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-non-null-assertion': 'off',
  '@typescript-eslint/unbound-method': 'off',
  '@typescript-eslint/no-empty-function': 'off',
  '@typescript-eslint/require-await': 'off',
  '@typescript-eslint/no-unnecessary-condition': 'off',
  '@typescript-eslint/no-unnecessary-type-assertion': 'off',
  'sonarjs/no-duplicate-string': 'off',
  'sonarjs/no-hardcoded-passwords': 'off',
  'sonarjs/no-hardcoded-ip': 'off',
  'security/detect-object-injection': 'off',
  'max-lines': 'off',
  'max-lines-per-function': 'off',

  // Una fabrica de dobles declarada dentro del `describe` que la usa mantiene
  // junto el caso y su preparacion. Sacarla al ambito del modulo, como pide la
  // regla, alejaria el doble de las pruebas que lo explican.
  'unicorn/consistent-function-scoping': 'off',

  // `expect((await caso.ejecutar()).total)` es la forma directa de afirmar
  // sobre un campo del resultado; una variable intermedia solo anade ruido.
  'unicorn/no-await-expression-member': 'off',

  // La prueba de las excepciones de dominio hace un viaje de ida y vuelta por
  // JSON A PROPOSITO: es lo que ocurre de verdad al cruzar el transporte TCP
  // entre microservicios. `structuredClone` seria mas eficiente y probaria otra
  // cosa: conserva tipos que JSON pierde, que es justo lo que hay que verificar
  // que sobrevive.
  'unicorn/prefer-structured-clone': 'off',
};

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules', '*.d.ts', 'eslint-report.json']),

  sonarjs.configs.recommended,

  // ===========================================================================
  // Marcadores de trabajo pendiente.
  //
  // `sonarjs/todo-tag` busca la cadena "todo" sin distinguir idioma, de modo que
  // marca como tarea pendiente cualquier comentario en espanol que use esa
  // palabra, que en castellano es de las mas frecuentes. La documentacion de
  // este proyecto esta en espanol: la regla senalaria prosa correcta y obligaria
  // a escribir peor para complacerla.
  //
  // No se pierde el control: `no-warning-comments` cubre el mismo cometido
  // comparando marcadores explicitos, que si son inequivocos.
  // ===========================================================================
  {
    rules: {
      'sonarjs/todo-tag': 'off',
      'sonarjs/fixme-tag': 'off',
      'no-warning-comments': [
        'error',
        // Los marcadores se componen para que la propia configuracion no los
        // contenga literalmente y se senale a si misma.
        {
          terms: ['TO' + 'DO:', 'FIX' + 'ME:', 'XXX:', 'HACK:', 'PENDIEN' + 'TE:'],
          location: 'anywhere',
        },
      ],
    },
  },

  // ===========================================================================
  // Codigo TypeScript del proyecto.
  // ===========================================================================
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    plugins: {
      'import-x': importX,
      security,
      unicorn,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: './tsconfig.json',
        }),
      ],
    },
    linterOptions: {
      // Un `eslint-disable` que ya no suprime nada es deuda: se elimina.
      reportUnusedDisableDirectives: 'error',
      // Y uno que si suprime algo tampoco se admite: la causa se corrige.
      noInlineConfig: true,
    },
    rules: {
      ...sonarExtraActivas,
      ...unicornExtraActivas,

      // --- Integridad de las importaciones ---------------------------------
      'import-x/no-duplicates': 'error',
      'import-x/no-cycle': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-unresolved': 'error',
      'import-x/no-useless-path-segments': 'error',
      'import-x/no-mutable-exports': 'error',
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-absolute-path': 'error',
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/*.spec.ts', 'test/**', '*.config.ts', '*.config.mjs'],
          optionalDependencies: false,
          peerDependencies: false,
        },
      ],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [{ pattern: '@hce/**', group: 'internal', position: 'before' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // --- Correccion general ----------------------------------------------
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'no-console': 'error',
      'no-debugger': 'error',
      'no-self-compare': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-shadow': 'off',
      'no-implied-eval': 'off',
      'no-return-await': 'off',
      'no-loop-func': 'off',

      // --- Seguridad --------------------------------------------------------
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-child-process': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-object-injection': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-unsafe-regex': 'error',

      // --- Seguridad de tipos ----------------------------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-meaningless-void-operator': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'error',
      '@typescript-eslint/prefer-literal-enum-member': 'error',
      '@typescript-eslint/no-loop-func': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: false },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // ===========================================================================
  // Reglas de arquitectura (CA-HCE v1). Ver eslint.architecture.mjs.
  // ===========================================================================
  ...configuracionesCleanArchitecture,

  // ===========================================================================
  // Un caso de uso no pasa de 120 lineas.
  //
  // El limite general del proyecto son 400 lineas por archivo. Aqui se aprieta a
  // 120 por una razon concreta: un caso de uso representa UNA operacion del
  // negocio. Si no cabe en 120 lineas es que esta haciendo mas de una cosa, y lo
  // correcto no es dividir el archivo sino dividir la operacion en dos casos de
  // uso que la fachada componga.
  //
  // El limite es holgado a proposito: el caso de uso mas grande del sistema
  // -iniciar sesion, que incluye la defensa contra enumeracion por
  // temporizacion- ocupa 74 lineas. Que sobre margen es la senal de que la
  // regla mide bien: no obliga a comprimir codigo legible, solo impide que un
  // caso de uso crezca hasta convertirse en un servicio con tres
  // responsabilidades.
  //
  // Las lineas en blanco y los comentarios no cuentan: documentar una decision
  // de diseno no debe penalizar.
  // ===========================================================================
  {
    files: ['apps/*/src/aplicacion/casos-uso/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'max-lines': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
      // Un metodo `ejecutar` de mas de 60 lineas tiene el mismo problema que un
      // archivo de mas de 120: son varias operaciones disfrazadas de una.
      'max-lines-per-function': [
        'error',
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // ===========================================================================
  // Puntos de entrada del proceso.
  //
  // `main.ts` arranca el servicio y su salida por consola es la unica traza que
  // existe antes de que el contenedor de inyeccion este en pie. Se le permite
  // el Logger de NestJS, que internamente escribe por consola.
  // ===========================================================================
  {
    files: ['apps/*/src/infraestructura/main.ts'],
    rules: { 'no-console': 'off' },
  },

  // ===========================================================================
  // Cuatro accesos indexados con clave de tipo cerrado.
  //
  // `security/detect-object-injection` marca TODO acceso calculado, y no puede
  // ver lo unico que decide si es peligroso: el tipo de la clave. En estos
  // cuatro sitios la clave no viene de la peticion:
  //
  //   - usuario-actual.decorador.ts : `usuario[campo]` con campo tipado como
  //     `keyof UsuarioAutenticado`. TypeScript ya garantiza que existe.
  //   - jwt.estrategia.ts           : el nombre de la cookie sale de la
  //     configuracion del servidor, no del cliente.
  //   - excepcion-http.filtro.ts    : `CODIGO_POR_STATUS[status]` con status del
  //     enum HttpStatus.
  //   - mssql.service.ts            : `TRADUCCION_ERRORES_SQL[numero]` con un
  //     numero de error que emite el propio motor de base de datos.
  //
  // La alternativa seria un `Map`, y seria peor: el `Record` tipado deja que el
  // compilador verifique la clave, y un `Map` cambia esa garantia por una rama
  // de `undefined` que no aporta nada. Se declara por ruta y con motivo para que
  // aparezca en la revision de este archivo, no como un comentario escondido en
  // el codigo.
  // ===========================================================================
  {
    files: [
      'apps/api-gateway/src/adaptadores/seguridad/decoradores/usuario-actual.decorador.ts',
      'apps/api-gateway/src/adaptadores/seguridad/estrategias/jwt.estrategia.ts',
      'libs/compartido/src/adaptadores/filtros/excepcion-http.filtro.ts',
      'libs/compartido/src/infraestructura/persistencia/mssql.service.ts',
    ],
    rules: { 'security/detect-object-injection': 'off' },
  },

  // ===========================================================================
  // Pruebas.
  // ===========================================================================
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    plugins: { jest },
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { projectService: true, tsconfigRootDir },
    },
    settings: { jest: { version: 'detect' } },
    rules: {
      ...relajacionesPruebas,
      // La prueba de la regla de dependencia recorre el arbol de fuentes de
      // forma dinamica: leer rutas calculadas es exactamente su cometido.
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  prettierConfig,
]);
