import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';

import {
  ActualizarProductoDto,
  CrearProductoDto,
  ListarProductosDto,
} from './producto.dto';

/**
 * Pruebas de los DTO de producto.
 *
 * Los DTO son la frontera de confianza del sistema: todo lo que entra por HTTP
 * pasa por aqui antes de llegar a ninguna logica. Se prueban ejecutando el
 * mismo par que usa NestJS en produccion -`plainToInstance` seguido de
 * `validateSync`- para que la prueba recorra exactamente el camino real y no
 * una aproximacion.
 *
 * Hay dos comportamientos que van mas alla de "valida o no valida":
 *
 *   - La CONVERSION de tipos. En una peticion HTTP todo llega como texto: el
 *     query string no tiene numeros. Sin `@Type(() => Number)`, la pagina "2"
 *     viajaria como cadena hasta SQL Server.
 *
 *   - El RECORTE de espacios. Un nombre con espacio final crea un duplicado
 *     invisible en el catalogo: "Paracetamol " y "Paracetamol" conviven, se ven
 *     iguales en pantalla y la restriccion UNIQUE no los detecta.
 */
describe('DTO de producto', () => {
  /** Reproduce lo que hace el ValidationPipe: convertir y despues validar. */
  const validar = <T extends object>(Clase: new () => T, carga: unknown) => {
    const instancia = plainToInstance(Clase, carga, { enableImplicitConversion: false });
    return { instancia, errores: validateSync(instancia as object) };
  };

  /** Aplana los mensajes, incluidos los de propiedades anidadas. */
  const mensajesDe = (errores: ValidationError[]): string[] =>
    errores.flatMap((e) => [
      ...Object.values(e.constraints ?? {}),
      ...mensajesDe(e.children ?? []),
    ]);

  describe('CrearProductoDto', () => {
    const valido = {
      nombreProducto: 'Paracetamol 500 mg',
      nroLote: 'LT-2026-0001',
      costo: 0.49,
    };

    it('acepta un alta completa', () => {
      expect(validar(CrearProductoDto, valido).errores).toHaveLength(0);
    });

    it('acepta el precio de venta opcional', () => {
      const { errores } = validar(CrearProductoDto, { ...valido, precioVenta: 0.66 });

      // Si no se envia, el servidor lo calcula aplicando el margen de 1.35.
      expect(errores).toHaveLength(0);
    });

    /*
     * El recorte no es cosmetico. Sin el, "Paracetamol " y "Paracetamol" son dos
     * productos distintos para la base: se ven identicos en pantalla, el usuario
     * no entiende por que hay duplicados y la restriccion UNIQUE no los cruza.
     */
    it('recorta los espacios del nombre antes de guardarlo', () => {
      const { instancia } = validar(CrearProductoDto, {
        ...valido,
        nombreProducto: '  Paracetamol 500 mg  ',
      });

      expect(instancia.nombreProducto).toBe('Paracetamol 500 mg');
    });

    it('recorta tambien el numero de lote', () => {
      const { instancia } = validar(CrearProductoDto, {
        ...valido,
        nroLote: '  LT-2026-0001 ',
      });

      expect(instancia.nroLote).toBe('LT-2026-0001');
    });

    it('un nombre de solo espacios se rechaza tras recortarlo', () => {
      const { errores } = validar(CrearProductoDto, { ...valido, nombreProducto: '   ' });

      // Sin el recorte previo pasaria la validacion de "no vacio".
      expect(mensajesDe(errores).join(' ')).toMatch(/obligatorio/i);
    });

    it('deja intacto lo que no es texto', () => {
      const { instancia } = validar(CrearProductoDto, { ...valido, nombreProducto: 42 });

      // El recorte no debe romperse ante un tipo inesperado; de rechazarlo ya se
      // encarga la validacion siguiente. La lectura se ensancha a `unknown`
      // porque el DTO declara una cadena y aqui se comprueba justamente que
      // llega otra cosa: comparar los tipos declarados no diria nada util.
      const recibido: unknown = instancia.nombreProducto;
      expect(recibido).toBe(42);
    });

    it.each([
      ['falta el nombre', { nroLote: 'LT-1', costo: 1 }],
      ['falta el lote', { nombreProducto: 'X', costo: 1 }],
      ['falta el costo', { nombreProducto: 'X', nroLote: 'LT-1' }],
    ])('rechaza cuando %s', (_caso, carga) => {
      expect(validar(CrearProductoDto, carga).errores.length).toBeGreaterThan(0);
    });

    it('rechaza un costo negativo', () => {
      const { errores } = validar(CrearProductoDto, { ...valido, costo: -1 });

      expect(mensajesDe(errores).join(' ')).toMatch(/negativo/i);
    });

    it('acepta el costo cero: hay insumos de coste nulo, como muestras', () => {
      expect(validar(CrearProductoDto, { ...valido, costo: 0 }).errores).toHaveLength(0);
    });

    /*
     * Cuatro decimales son los que declara la columna DECIMAL(18,4). Admitir mas
     * en la API significaria que la base redondea en silencio y el importe
     * guardado no coincide con el que el usuario escribio.
     */
    it('rechaza mas decimales de los que admite la columna', () => {
      const { errores } = validar(CrearProductoDto, { ...valido, costo: 0.123_45 });

      expect(mensajesDe(errores).join(' ')).toMatch(/4 decimales/);
    });

    it('acepta exactamente cuatro decimales', () => {
      expect(
        validar(CrearProductoDto, { ...valido, costo: 0.1234 }).errores,
      ).toHaveLength(0);
    });

    it('rechaza un nombre mas largo que la columna', () => {
      const { errores } = validar(CrearProductoDto, {
        ...valido,
        nombreProducto: 'a'.repeat(151),
      });

      // 150 es el ancho de Nombre_producto: rechazarlo aqui da un 400 claro en
      // vez de un error del motor por truncamiento.
      expect(errores.length).toBeGreaterThan(0);
    });

    it('convierte a numero el costo que llega como texto', () => {
      const { instancia } = validar(CrearProductoDto, { ...valido, costo: '0.49' });

      // Importe en coma flotante: se compara con tolerancia. Lo que interesa es
      // que ya sea un numero y valga lo que se envio, no la representacion
      // binaria exacta.
      expect(typeof instancia.costo).toBe('number');
      expect(instancia.costo).toBeCloseTo(0.49, 4);
    });
  });

  describe('ActualizarProductoDto', () => {
    /*
     * Todos los campos son opcionales: es una actualizacion parcial. Enviar solo
     * el costo no debe obligar a reenviar el nombre y el lote, que es lo que
     * pasaria si el DTO los exigiera.
     */
    it('acepta una actualizacion de un solo campo', () => {
      expect(validar(ActualizarProductoDto, { costo: 0.55 }).errores).toHaveLength(0);
    });

    it('acepta un cuerpo vacio', () => {
      expect(validar(ActualizarProductoDto, {}).errores).toHaveLength(0);
    });

    /*
     * Opcional no es lo mismo que vaciable. Se puede omitir el nombre, pero no
     * mandarlo en blanco: eso dejaria un producto sin nombre en el catalogo.
     */
    it('rechaza vaciar el nombre enviandolo en blanco', () => {
      const { errores } = validar(ActualizarProductoDto, { nombreProducto: '' });

      expect(mensajesDe(errores).join(' ')).toMatch(/no puede quedar vacio/i);
    });

    it('rechaza vaciar el lote', () => {
      const { errores } = validar(ActualizarProductoDto, { nroLote: '   ' });

      expect(mensajesDe(errores).join(' ')).toMatch(/no puede quedar vacio/i);
    });

    it('recorta los espacios igual que en el alta', () => {
      const { instancia } = validar(ActualizarProductoDto, {
        nombreProducto: '  Ibuprofeno 400 mg ',
      });

      expect(instancia.nombreProducto).toBe('Ibuprofeno 400 mg');
    });

    it('rechaza un costo negativo', () => {
      expect(
        validar(ActualizarProductoDto, { costo: -0.01 }).errores.length,
      ).toBeGreaterThan(0);
    });
  });

  describe('ListarProductosDto', () => {
    it('aplica pagina 1 y tamano por defecto si no se piden', () => {
      const { instancia } = validar(ListarProductosDto, {});

      expect(instancia.pagina).toBe(1);
      expect(instancia.tamanoPagina).toBeGreaterThan(0);
    });

    /*
     * En un query string todo llega como texto: `?pagina=2` es la cadena "2".
     * Sin la conversion, ese valor viajaria como cadena hasta el parametro de
     * SQL Server, que espera un entero.
     */
    it('convierte a numero lo que llega del query string', () => {
      const { instancia } = validar(ListarProductosDto, {
        pagina: '3',
        tamanoPagina: '50',
      });

      expect(instancia.pagina).toBe(3);
      expect(instancia.tamanoPagina).toBe(50);
    });

    it('rechaza una pagina menor que 1', () => {
      const { errores } = validar(ListarProductosDto, { pagina: '0' });

      expect(mensajesDe(errores).join(' ')).toMatch(/pagina minima es 1/i);
    });

    it('rechaza una pagina que no es entera', () => {
      expect(
        validar(ListarProductosDto, { pagina: '1.5' }).errores.length,
      ).toBeGreaterThan(0);
    });

    /*
     * El tope del tamano de pagina es una defensa contra la denegacion de
     * servicio: sin el, `?tamanoPagina=999999` obligaria a la base a materializar
     * el catalogo entero y al gateway a serializarlo.
     */
    it('rechaza un tamano de pagina desmesurado', () => {
      const { errores } = validar(ListarProductosDto, { tamanoPagina: '100000' });

      expect(mensajesDe(errores).join(' ')).toMatch(/tamano maximo/i);
    });

    it('acepta el texto de busqueda', () => {
      const { instancia, errores } = validar(ListarProductosDto, {
        buscar: 'paracetamol',
      });

      expect(errores).toHaveLength(0);
      expect(instancia.buscar).toBe('paracetamol');
    });

    it('rechaza un texto de busqueda desmesurado', () => {
      expect(
        validar(ListarProductosDto, { buscar: 'a'.repeat(151) }).errores.length,
      ).toBeGreaterThan(0);
    });
  });
});
