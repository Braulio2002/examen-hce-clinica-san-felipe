/**
 * Tipos de las pruebas del FrontEnd.
 *
 * `@testing-library/jest-dom/vitest` amplia la interfaz de aserciones de Vitest
 * con los matchers de DOM: `toBeVisible`, `toHaveAttribute`, `toHaveFocus` y
 * demas. En tiempo de ejecucion los registra `vitest.setup.ts`; esta referencia
 * es lo que hace que TypeScript -y con el, ESLint- tambien los conozca.
 *
 * Sin esto, `expect(algo).toBeVisible()` compila como una llamada a un tipo sin
 * resolver, y el analisis con informacion de tipos marca cada asercion de cada
 * prueba como insegura. El archivo se incluye desde el `tsconfig.json` de cada
 * paquete y aplicacion, que es donde se define el programa de TypeScript.
 */

/// <reference types="@testing-library/jest-dom/vitest" />
