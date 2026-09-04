import { describe, expect, it } from 'vitest';

import { coincideOpcion, type OpcionBuscable } from './selector-buscable';

/**
 * Pruebas del filtro del selector buscable.
 *
 * Se prueba la funcion de coincidencia y no el componente entero: es donde vive
 * la decision, y montar el DOM para comprobar un `includes` daria menos senal a
 * cambio de mucha maquinaria.
 *
 * Los casos no son teoricos. Reflejan como se busca de verdad en farmacia:
 * escribiendo poco, sin tildes, y a menudo el numero de lote que se lee en la
 * caja que se tiene en la mano.
 */
const PARACETAMOL = 'Paracetamol 500 mg';
const PARACETAMOL_TABLETA = 'Paracetamol 500 mg Tableta';

const opcion = (etiqueta: string, terminosExtra?: string): OpcionBuscable => ({
  id: 1,
  etiqueta,
  terminosExtra,
});

describe('Filtro del selector buscable', () => {
  it('sin consulta muestra todo', () => {
    expect(coincideOpcion(opcion(PARACETAMOL), '')).toBe(true);
  });

  it('encuentra por un fragmento del nombre', () => {
    expect(coincideOpcion(opcion(PARACETAMOL_TABLETA), 'para')).toBe(true);
  });

  it('ignora mayusculas', () => {
    expect(coincideOpcion(opcion(PARACETAMOL), 'PARACETAMOL')).toBe(true);
  });

  it('ignora tildes en la consulta y en el dato', () => {
    // "Solucion" escrito sin tilde debe encontrar "Solución", y al reves.
    expect(coincideOpcion(opcion('Solución Salina'), 'solucion')).toBe(true);
    expect(coincideOpcion(opcion('Solucion Salina'), 'solución')).toBe(true);
  });

  it('admite palabras sueltas en cualquier orden', () => {
    // Se escribe "500 para", no "Paracetamol 500": el orden no deberia importar.
    expect(coincideOpcion(opcion(PARACETAMOL_TABLETA), '500 para')).toBe(true);
  });

  it('exige que TODAS las palabras coincidan', () => {
    expect(coincideOpcion(opcion(PARACETAMOL), 'para 800')).toBe(false);
  });

  it('encuentra por numero de lote', () => {
    // El caso que motivo `terminosExtra`: farmacia tiene la caja delante.
    const producto = opcion('Alcohol Medicinal 70% 1 L', 'LT-2026-0010');

    expect(coincideOpcion(producto, '0010')).toBe(true);
    expect(coincideOpcion(producto, 'lt-2026')).toBe(true);
  });

  it('descarta lo que no coincide', () => {
    expect(coincideOpcion(opcion('Ibuprofeno 400 mg'), 'gasa')).toBe(false);
  });

  it('los espacios de mas no rompen la busqueda', () => {
    expect(coincideOpcion(opcion('Gasa Esteril 10x10 cm'), '  gasa   10x10  ')).toBe(
      true,
    );
  });

  it('no falla cuando la opcion no tiene terminos extra', () => {
    expect(coincideOpcion(opcion('Jeringa Descartable 5 mL'), 'jeringa')).toBe(true);
    expect(coincideOpcion(opcion('Jeringa Descartable 5 mL'), 'LT-2026')).toBe(false);
  });
});
