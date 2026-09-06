import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const raiz = (ruta: string): string => fileURLToPath(new URL(ruta, import.meta.url));

/**
 * Configuracion de pruebas del FrontEnd.
 *
 * Se declara un PROYECTO por workspace, y no una configuracion unica, porque
 * cada aplicacion Next resuelve `@/` contra su propio `src`. Con una sola
 * configuracion, el alias del shell apuntaria tambien a los archivos de la zona
 * de inventario y las pruebas cargarian el modulo equivocado.
 *
 * Es la misma separacion que impone la arquitectura Multi-Zones en tiempo de
 * ejecucion: dos aplicaciones independientes que comparten los paquetes de
 * `paquetes/`, no una sola con carpetas distintas.
 *
 * El umbral es el mismo que el del BackEnd -90 % en las cuatro metricas- y esta
 * declarado, no solo alcanzado: una regresion que baje la cobertura hace fallar
 * `npm test`, y con ello la integracion continua.
 *
 * Sobre las exclusiones, cada una tiene su motivo:
 *
 *   - `app/**`: en el App Router de Next son archivos de enrutado. Cada
 *     `page.tsx` solo elige un componente de `funcionalidades/`, que es donde
 *     esta la logica y donde si hay pruebas. Probar el enrutado exige levantar
 *     Next entero, y de eso se encargan las pruebas de humo.
 *   - `middleware.ts`: se ejecuta en el runtime Edge de Next, fuera de jsdom.
 *     Las cabeceras de seguridad que produce se verifican en las pruebas de humo
 *     contra la aplicacion levantada, que es donde de verdad importan.
 *   - Configuracion y puntos de reexportacion: no tienen comportamiento propio.
 */
const comun = {
  // jsdom: los componentes se montan de verdad y se consultan como lo haria una
  // persona, en lugar de comprobar detalles internos de React.
  environment: 'jsdom' as const,
  globals: true,
  setupFiles: [raiz('./vitest.setup.ts')],
};

export default defineConfig({
  // Transformacion automatica de JSX: los componentes no importan React, igual
  // que en Next. Sin esto, cada `.tsx` fallaria con "React is not defined".
  esbuild: { jsx: 'automatic' },
  test: {
    projects: [
      {
        esbuild: { jsx: 'automatic' },
        test: {
          ...comun,
          name: 'paquetes',
          include: ['paquetes/**/*.{spec,test}.{ts,tsx}'],
        },
      },
      {
        esbuild: { jsx: 'automatic' },
        resolve: { alias: { '@': raiz('./apps/shell/src') } },
        test: {
          ...comun,
          name: 'shell',
          include: ['apps/shell/**/*.{spec,test}.{ts,tsx}'],
        },
      },
      {
        esbuild: { jsx: 'automatic' },
        resolve: { alias: { '@': raiz('./apps/inventario/src') } },
        test: {
          ...comun,
          name: 'inventario',
          include: ['apps/inventario/**/*.{spec,test}.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      include: ['apps/*/src/**/*.{ts,tsx}', 'paquetes/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.{spec,test}.{ts,tsx}',
        '**/app/**',
        '**/middleware.ts',
        '**/index.ts',
        '**/tipos.ts',
        '**/tailwind.config.ts',
      ],
      /*
       * Cobertura completa, declarada y no solo alcanzada: cualquier linea
       * nueva sin prueba hace fallar `npm test`, y con ello la integracion
       * continua.
       *
       * Las ramas van a 99.8 y no a 100 por UNA sola, en `modal.tsx`:
       *
       *   const primero = enfocables[0];
       *   const ultimo = enfocables[enfocables.length - 1];
       *   if (!primero || !ultimo) return;
       *
       * Con `noUncheckedIndexedAccess` activado, TypeScript exige comprobar el
       * resultado de indexar un array. En ejecucion esa comprobacion no puede
       * fallar: el contenedor del dialogo siempre incluye su boton de cerrar,
       * de modo que la lista nunca esta vacia.
       *
       * Cubrirla exigiria una asercion de no nulidad -que debilita los tipos y
       * ademas prohibe la configuracion estricta del linter- o retorcer el
       * componente para fabricar un caso que no existe. Ninguna de las dos cosas
       * mejora el codigo, asi que el umbral refleja la realidad en lugar de
       * disimularla.
       */
      thresholds: {
        statements: 100,
        branches: 99.8,
        functions: 100,
        lines: 100,
      },
    },
  },
});
