import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Preparacion comun de las pruebas del FrontEnd.
 *
 * `cleanup` desmonta lo que quedara montado despues de cada prueba. Sin esto,
 * los componentes se acumulan en el mismo documento y una consulta por texto
 * empieza a encontrar varias coincidencias: la prueba falla por contaminacion
 * entre casos y no por el codigo, que es el tipo de fallo mas caro de
 * diagnosticar de una suite.
 */
afterEach(() => {
  cleanup();
});

/*
 * jsdom no implementa `scrollIntoView`: no tiene disposicion visual, asi que la
 * nocion de "desplazar hasta que se vea" no existe para el.
 *
 * Es una carencia del entorno de pruebas, no del codigo. El selector buscable lo
 * usa para mantener a la vista la opcion resaltada al recorrer la lista con las
 * flechas, que es comportamiento correcto y necesario. Se declara como funcion
 * vacia para que el codigo real se pueda ejecutar; lo que hace de verdad -que
 * la opcion quede visible- solo se puede comprobar en un navegador.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function noOperativo(): void {
    // Sin efecto: jsdom no tiene disposicion visual que desplazar.
  };
}
