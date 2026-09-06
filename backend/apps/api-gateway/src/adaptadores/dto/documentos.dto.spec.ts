import { plainToInstance } from 'class-transformer';
import { type ValidationError, validateSync } from 'class-validator';

import { RegistrarCompraDto } from './compra.dto';
import { RegistrarVentaDto } from './venta.dto';

/**
 * Pruebas de los contratos de entrada de compra y venta.
 *
 * Los DTO son la frontera donde el sistema deja de confiar en el exterior, y
 * aqui se prueban como lo que son: reglas de seguridad, no documentacion.
 *
 * Se valida con `plainToInstance` seguido de `validateSync` porque es
 * exactamente lo que hace el `ValidationPipe` de NestJS al recibir una peticion.
 * Probar la clase directamente, sin transformar, no ejercitaria los `@Type()` y
 * dejaria fuera justo la parte que convierte cadenas en numeros.
 *
 * La prueba mas importante de este archivo es la ultima: que la linea de venta
 * NO acepte un precio.
 */
/**
 * Aplana el arbol de errores de class-validator.
 *
 * Con `@ValidateNested({ each: true })` los errores llegan en dos niveles: uno
 * por indice del array y, dentro, uno por campo invalido. Aplanar solo un nivel
 * deja fuera precisamente los mensajes de las lineas, que es lo que interesa
 * comprobar.
 */
const mensajesDe = (errores: ValidationError[]): string[] =>
  errores.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...mensajesDe(e.children ?? []),
  ]);

const validar = (cls: new () => object, cuerpo: unknown): string[] => {
  const instancia = plainToInstance(cls, cuerpo, { enableImplicitConversion: false });
  // Las mismas opciones que aplica el pipe global del Gateway.
  return mensajesDe(
    validateSync(instancia, { whitelist: true, forbidNonWhitelisted: true }),
  );
};

describe('Contratos de entrada de documentos', () => {
  describe('RegistrarCompraDto', () => {
    const compraValida = {
      lineas: [{ idProducto: 1, cantidad: 100, precio: 0.45 }],
    };

    it('acepta una compra bien formada', () => {
      expect(validar(RegistrarCompraDto, compraValida)).toEqual([]);
    });

    it('exige al menos una linea', () => {
      const errores = validar(RegistrarCompraDto, { lineas: [] });

      expect(errores.join(' ')).toMatch(/al menos un producto/i);
    });

    /*
     * El tope de 200 lineas no es capricho: sin el, una sola peticion podria
     * construir un parametro de tabla enorme y bloquear el procedimiento.
     */
    it('rechaza una compra desmesurada', () => {
      const lineas = Array.from({ length: 201 }, (_, i) => ({
        idProducto: i + 1,
        cantidad: 1,
        precio: 1,
      }));

      expect(validar(RegistrarCompraDto, { lineas }).join(' ')).toMatch(/200 lineas/i);
    });

    it('admite exactamente el tope', () => {
      const lineas = Array.from({ length: 200 }, (_, i) => ({
        idProducto: i + 1,
        cantidad: 1,
        precio: 1,
      }));

      expect(validar(RegistrarCompraDto, { lineas })).toEqual([]);
    });

    it('rechaza si falta el campo lineas', () => {
      expect(validar(RegistrarCompraDto, {})).not.toEqual([]);
    });

    describe('linea de compra', () => {
      const conLinea = (linea: Record<string, unknown>) =>
        validar(RegistrarCompraDto, { lineas: [linea] });

      it('rechaza un identificador de producto no entero', () => {
        expect(conLinea({ idProducto: 1.5, cantidad: 1, precio: 1 }).join(' ')).toMatch(
          /entero/i,
        );
      });

      it('rechaza un identificador menor que uno', () => {
        expect(conLinea({ idProducto: 0, cantidad: 1, precio: 1 })).not.toEqual([]);
      });

      it('rechaza cantidad cero', () => {
        expect(conLinea({ idProducto: 1, cantidad: 0, precio: 1 }).join(' ')).toMatch(
          /mayor a cero/i,
        );
      });

      it('rechaza cantidad negativa', () => {
        expect(conLinea({ idProducto: 1, cantidad: -5, precio: 1 })).not.toEqual([]);
      });

      it('rechaza un costo negativo', () => {
        expect(conLinea({ idProducto: 1, cantidad: 1, precio: -1 }).join(' ')).toMatch(
          /negativo/i,
        );
      });

      it('acepta costo cero: hay insumos donados', () => {
        expect(conLinea({ idProducto: 1, cantidad: 1, precio: 0 })).toEqual([]);
      });

      it('rechaza mas de cuatro decimales, que la base no guarda', () => {
        expect(conLinea({ idProducto: 1, cantidad: 1, precio: 0.123456 })).not.toEqual(
          [],
        );
      });

      it('rechaza un campo no declarado', () => {
        // Cierra la asignacion masiva: un `total` enviado por el cliente no
        // debe poder colarse hasta la base.
        expect(
          conLinea({ idProducto: 1, cantidad: 1, precio: 1, total: 999 }),
        ).not.toEqual([]);
      });
    });
  });

  describe('RegistrarVentaDto', () => {
    it('acepta una venta bien formada', () => {
      expect(
        validar(RegistrarVentaDto, { lineas: [{ idProducto: 1, cantidad: 10 }] }),
      ).toEqual([]);
    });

    it('exige al menos una linea', () => {
      expect(validar(RegistrarVentaDto, { lineas: [] })).not.toEqual([]);
    });

    it('rechaza cantidad cero', () => {
      expect(
        validar(RegistrarVentaDto, { lineas: [{ idProducto: 1, cantidad: 0 }] }),
      ).not.toEqual([]);
    });

    /*
     * ESTA ES LA PRUEBA IMPORTANTE DEL ARCHIVO.
     *
     * La linea de venta no declara un campo `precio`, y con
     * `forbidNonWhitelisted` activo enviarlo hace fallar la peticion.
     *
     * Si se aceptara, cualquiera podria abrir las herramientas del navegador y
     * despachar un medicamento al importe que quisiera. El precio lo resuelve el
     * servidor a partir del catalogo, y esta prueba es lo que impide que alguien
     * "arregle" el DTO anadiendo el campo sin entender por que no estaba.
     */
    it('RECHAZA un precio enviado por el cliente', () => {
      const errores = validar(RegistrarVentaDto, {
        lineas: [{ idProducto: 1, cantidad: 10, precio: 0.01 }],
      });

      expect(errores).not.toEqual([]);
      expect(errores.join(' ')).toMatch(/precio/i);
    });
  });
});
