import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

import { configuracionesMicrofront } from './eslint.architecture.mjs';

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

/**
 * Configuracion de ESLint del FrontEnd.
 *
 * Portada de SIGPRO PECEPE y adaptada a este proyecto:
 *   - Next.js en lugar de Vite: se retira `eslint-plugin-react-refresh`, que
 *     comprueba una restriccion del HMR de Vite que Next no tiene.
 *   - Sin Storybook ni Vitest todavia: sus bloques se anadiran cuando existan
 *     esos archivos, en lugar de dejar configuracion que no aplica a nada.
 *   - Reglas de arquitectura propias del microfront (FA-HCE), en
 *     `eslint.architecture.mjs`.
 *
 * Nota de version: aqui ESLint va en la rama 9 y no en la 10 como el BackEnd,
 * porque `eslint-plugin-jsx-a11y` todavia no declara la 10 entre sus peers.
 * Forzar la instalacion habria dejado un arbol de dependencias que npm no puede
 * verificar; se prefiere una version menor y coherente.
 */

/** Reglas SonarJS adicionales a las recomendadas. */
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
  'unicorn/no-object-as-default-parameter': 'error',
  'unicorn/prefer-array-find': 'error',
  'unicorn/prefer-array-some': 'error',
  'unicorn/prefer-includes': 'error',
  'unicorn/no-unreadable-array-destructuring': 'error',
  'unicorn/no-useless-fallback-in-spread': 'error',
  'unicorn/prefer-node-protocol': 'error',
  'unicorn/throw-new-error': 'error',
  'unicorn/prefer-query-selector': 'error',
  'unicorn/prefer-dom-node-text-content': 'error',
  'unicorn/prefer-add-event-listener': 'error',
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

const ARCHIVOS_APP = ['apps/*/src/**/*.{ts,tsx}', 'paquetes/*/src/**/*.{ts,tsx}'];
const ARCHIVOS_NODE = ['*.config.{ts,mjs}', 'apps/*/*.config.{ts,mjs}', 'eslint*.mjs'];
const ARCHIVOS_PRUEBA = [
  'apps/*/src/**/*.{spec,test}.{ts,tsx}',
  'paquetes/*/src/**/*.{spec,test}.{ts,tsx}',
];

/**
 * Preparacion de las pruebas. Vive en la raiz, fuera del programa de TypeScript
 * de los paquetes, pero se ejecuta en jsdom y necesita los globales del
 * navegador -toca `Element.prototype`-, asi que no encaja ni con las
 * aplicaciones ni con los scripts de Node y lleva su propio bloque.
 */
const ARCHIVOS_PREPARACION = ['vitest.setup.ts'];

export default defineConfig([
  globalIgnores([
    '**/node_modules',
    '**/.next',
    '**/dist',
    '**/coverage',
    '**/*.d.ts',
    'apps/*/next-env.d.ts',
  ]),

  sonarjs.configs.recommended,

  // ===========================================================================
  // Marcas de trabajo pendiente.
  //
  // Las reglas de SonarJS las buscan sin distinguir idioma, y la primera
  // coincide con una palabra corrientisima del castellano ("Todo lo que..."),
  // con lo que senalaria cada segunda frase de los comentarios. Se sustituyen
  // por `no-warning-comments` con marcas que no colisionan con el idioma. La
  // prohibicion se mantiene: una marca de trabajo pendiente sigue sin poder
  // llegar a la rama principal.
  // ===========================================================================
  {
    rules: {
      'sonarjs/todo-tag': 'off',
      'sonarjs/fixme-tag': 'off',
      'no-warning-comments': [
        'error',
        { terms: ['TO' + 'DO:', 'FIX' + 'ME:', 'XXX:', 'HACK:'], location: 'anywhere' },
      ],
    },
  },

  // ===========================================================================
  // Codigo TypeScript y React de las zonas del microfront.
  // ===========================================================================
  {
    files: ARCHIVOS_APP,
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      jsxA11y.flatConfigs.strict,
    ],
    plugins: {
      'import-x': importX,
      unicorn,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      // La version se declara en lugar de detectarse: `detect` depende de como
      // se resuelva el arbol de node_modules, y en un monorepo con workspaces
      // eso no es reproducible. Debe mantenerse alineada con package.json.
      react: { version: '19.0' },
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ alwaysTryTypes: true }),
      ],
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      noInlineConfig: true,
    },
    rules: {
      ...sonarExtraActivas,
      ...unicornExtraActivas,
      ...reactHooks.configs.recommended.rules,

      // --- Integridad de las importaciones ---------------------------------
      'import-x/no-duplicates': 'error',
      'import-x/no-cycle': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'error',
      'import-x/no-mutable-exports': 'error',
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-absolute-path': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            { pattern: '@hce/**', group: 'internal', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'after' },
          ],
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
      'no-script-url': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-shadow': 'off',
      'no-implied-eval': 'off',
      'no-return-await': 'off',
      'no-loop-func': 'off',

      // --- React -------------------------------------------------------------
      // TypeScript ya describe la forma de las props; propTypes seria una
      // segunda fuente de verdad que se desincroniza.
      'react/prop-types': 'off',
      'react/no-danger': 'error',
      'react/no-danger-with-children': 'error',
      'react/no-array-index-key': 'error',
      'react/no-unstable-nested-components': 'error',
      'react/jsx-no-script-url': 'error',
      // `allowReferrer: false` evita ademas la fuga de la ruta interna al
      // destino externo (tabnabbing y referrer leaking).
      'react/jsx-no-target-blank': [
        'error',
        { allowReferrer: false, enforceDynamicLinks: 'always' },
      ],
      'react/jsx-no-useless-fragment': 'error',
      'react/self-closing-comp': 'error',
      'react/jsx-boolean-value': ['error', 'never'],
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      'react/no-object-type-as-default-prop': 'error',
      'react/void-dom-elements-no-children': 'error',

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
      '@typescript-eslint/no-loop-func': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true },
      ],
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
  // Reglas de arquitectura del microfront (FA-HCE v1).
  // ===========================================================================
  ...configuracionesMicrofront,

  // ===========================================================================
  // Archivos de prueba.
  //
  // Se les aplica exactamente el mismo analisis que al codigo de produccion,
  // incluido el que usa informacion de tipos: una prueba mal tipada es una
  // prueba que puede estar comprobando otra cosa. La UNICA regla que se relaja
  // es la de literales repetidos, y por un motivo concreto.
  //
  // En produccion, ver tres veces la misma cadena suele senalar un concepto sin
  // nombre. En una prueba es al reves: el valor literal ES la especificacion.
  //
  //   expect(await screen.findByText('Paracetamol 500 mg')).toBeVisible();
  //
  // se lee de un vistazo; con una constante en su lugar hay que ir a buscar que
  // vale para saber que se esta comprobando. Extraer esos literales haria las
  // pruebas mas dificiles de leer sin hacerlas mas faciles de mantener, que es
  // justo lo contrario de lo que persigue la regla.
  //
  // Todo lo demas -tipos, promesas sin esperar, complejidad, accesibilidad-
  // sigue exigiendose igual.
  // ===========================================================================
  {
    files: ARCHIVOS_PRUEBA,
    rules: { 'sonarjs/no-duplicate-string': 'off' },
  },
  {
    files: ARCHIVOS_PREPARACION,
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
      parser: tseslint.parser,
    },
  },

  // ===========================================================================
  // Configuracion y scripts: se ejecutan en Node, no en el navegador, y quedan
  // fuera del programa de TypeScript de las aplicaciones.
  // ===========================================================================
  {
    files: ARCHIVOS_NODE,
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: { 'no-console': 'off' },
  },
  {
    files: ARCHIVOS_NODE,
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettierConfig,
]);
