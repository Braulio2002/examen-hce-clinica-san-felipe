import { BcryptAdaptador } from './bcrypt.adaptador';

/**
 * Pruebas del adaptador de bcrypt.
 *
 * Se prueba contra bcrypt de verdad, no contra un doble. Es la excepcion
 * razonable a la regla de aislar dependencias: aqui lo que se quiere verificar
 * es justamente la interaccion con la libreria -que el hash generado se pueda
 * verificar despues- y con un doble esa prueba no diria nada.
 *
 * El coste es que estas pruebas tardan cientos de milisegundos: bcrypt esta
 * disenado para ser lento. Por eso se usan 4 rondas en lugar de las 10 de
 * produccion. Cuatro rondas siguen ejercitando el mismo camino de codigo y
 * bajan el tiempo de segundos a decimas.
 */
describe('BcryptAdaptador', () => {
  // 4 rondas: suficiente para ejercitar la libreria, rapido para la suite.
  const adaptador = new BcryptAdaptador(4);

  describe('generar', () => {
    it('produce un hash con el formato de bcrypt', async () => {
      const hash = await adaptador.generar('Clinica2026$');

      expect(hash).toMatch(/^\$2[aby]\$/);
    });

    it('nunca devuelve la contrasena en claro', async () => {
      const hash = await adaptador.generar('Clinica2026$');

      expect(hash).not.toContain('Clinica2026$');
    });

    /*
     * bcrypt incorpora una sal aleatoria en cada hash. Dos usuarios con la misma
     * contrasena tienen hashes distintos, y eso es lo que impide que una tabla
     * arcoiris o una simple comparacion revele que comparten clave.
     */
    it('genera hashes distintos para la misma contrasena', async () => {
      const [uno, otro] = await Promise.all([
        adaptador.generar('misma'),
        adaptador.generar('misma'),
      ]);

      expect(uno).not.toBe(otro);
    });
  });

  describe('verificar', () => {
    /*
     * Los cuatro casos comparten estructura, asi que van en una tabla. Se
     * agrupan ademas porque cada uno cuesta un hash de bcrypt: parametrizarlos
     * deja a la vista que lo unico que cambia es la contrasena que se intenta.
     */
    it.each([
      ['la contrasena correcta', 'Clinica2026$', true],
      ['una contrasena incorrecta', 'otraClave', false],
      ['la misma con otras mayusculas', 'clinica2026$', false],
      ['la contrasena vacia', '', false],
    ])('con %s devuelve %s', async (_caso, intento, esperado) => {
      const hash = await adaptador.generar('Clinica2026$');

      await expect(adaptador.verificar(intento, hash)).resolves.toBe(esperado);
    });

    /*
     * Este es el caso que justifica el try/catch del adaptador.
     *
     * Si un registro de la base tiene el hash corrupto o vacio -por una migracion
     * a medias, por ejemplo- bcrypt lanza. Sin la captura, ese fallo tecnico
     * subiria como error 500. Con ella se convierte en lo que de verdad
     * significa: la verificacion no paso, y el usuario ve "credenciales
     * invalidas". Ademas, un 500 en un caso y un 401 en otro le diria a un
     * atacante que ese usuario existe.
     */
    it.each([
      ['un hash vacio', ''],
      ['un hash con formato invalido', 'esto-no-es-un-hash'],
      ['un hash truncado', '$2a$10$'],
    ])('trata %s como verificacion fallida, no como error', async (_caso, hash) => {
      await expect(adaptador.verificar('Clinica2026$', hash)).resolves.toBe(false);
    });
  });

  describe('coste configurable', () => {
    /*
     * Las rondas son un parametro del constructor y no una constante escondida.
     * Permite subirlas en produccion segun el hardware sin tocar codigo, y
     * bajarlas en las pruebas para que la suite no tarde minutos.
     */
    it('el numero de rondas se refleja en el hash generado', async () => {
      const hash = await new BcryptAdaptador(5).generar('clave');

      expect(hash.startsWith('$2a$05$') || hash.startsWith('$2b$05$')).toBe(true);
    });

    it('usa 10 rondas por defecto', async () => {
      const hash = await new BcryptAdaptador().generar('clave');

      expect(hash).toContain('$10$');
    });
  });
});
