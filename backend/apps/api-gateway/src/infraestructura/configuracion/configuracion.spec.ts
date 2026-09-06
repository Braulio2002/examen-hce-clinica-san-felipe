import { cargarConfiguracion } from './configuracion';

/**
 * Pruebas de la configuracion del gateway.
 *
 * Esta funcion decide dos cosas que valen mas que el resto del archivo junto:
 * si el servicio ARRANCA y con que postura de seguridad lo hace.
 *
 * La validacion ocurre en el arranque y no en el primer uso, y es deliberado.
 * Un JWT_SECRET vacio que se descubre al primer login significa que el
 * contenedor esta "sano" para el orquestador mientras acepta tokens firmados
 * con una cadena vacia. Es preferible que no levante.
 *
 * Cada prueba restaura el entorno: dejar variables sueltas entre pruebas
 * produce fallos que dependen del orden de ejecucion, que es lo mas caro de
 * diagnosticar de una suite.
 */
describe('cargarConfiguracion', () => {
  const SECRETO_VALIDO = 'a'.repeat(48);
  let entornoOriginal: NodeJS.ProcessEnv;

  /** Variables que esta configuracion lee y que cada prueba debe controlar. */
  const esVariableDelGateway = (clave: string): boolean =>
    /^(JWT_|MS_|RATE_LIMIT_|CORS_)/.test(clave) ||
    ['GATEWAY_PORT', 'API_PREFIJO', 'NODE_ENV', 'COOKIE_SEGURA'].includes(clave);

  /**
   * Quita una variable del entorno reconstruyendo el objeto.
   *
   * Asignarle `undefined` no vale: Node convierte a texto todo lo que se pone
   * en `process.env`, y la variable acabaria valiendo la cadena "undefined".
   * La prueba seguiria pasando, pero por el motivo equivocado.
   */
  const quitarDelEntorno = (predicado: (clave: string) => boolean): void => {
    process.env = Object.fromEntries(
      Object.entries(process.env).filter(([clave]) => !predicado(clave)),
    );
  };

  beforeEach(() => {
    entornoOriginal = { ...process.env };

    // Se parte de un entorno limpio salvo el secreto: asi cada prueba declara
    // exactamente lo que necesita y nada se hereda de la anterior.
    quitarDelEntorno(esVariableDelGateway);
    process.env.JWT_SECRET = SECRETO_VALIDO;
  });

  afterEach(() => {
    process.env = entornoOriginal;
  });

  describe('secreto de firma', () => {
    /*
     * Un secreto corto se puede romper por fuerza bruta contra un unico token
     * capturado, y quien lo consiga puede firmar tokens con rol ADMIN. Treinta
     * y dos caracteres es el minimo razonable para HS256.
     */
    it.each([
      ['no esta definido', undefined],
      ['esta vacio', ''],
      ['es demasiado corto', 'corto'],
      ['tiene 31 caracteres, uno menos del minimo', 'a'.repeat(31)],
    ])('el servicio no arranca si el secreto %s', (_caso, valor) => {
      if (valor === undefined) quitarDelEntorno((c) => c === 'JWT_SECRET');
      else process.env.JWT_SECRET = valor;

      expect(() => cargarConfiguracion()).toThrow(/JWT_SECRET/);
    });

    it('acepta exactamente 32 caracteres', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);

      expect(cargarConfiguracion().jwt.secreto).toHaveLength(32);
    });

    it('el mensaje del fallo dice como generar uno', () => {
      quitarDelEntorno((c) => c === 'JWT_SECRET');

      // Un error de configuracion que no dice como arreglarse cuesta una
      // busqueda; uno que trae el comando se arregla en el momento.
      expect(() => cargarConfiguracion()).toThrow(/openssl rand/);
    });
  });

  describe('CORS', () => {
    it('por defecto solo admite el frontend local', () => {
      expect(cargarConfiguracion().origenesPermitidos).toEqual(['http://localhost:3000']);
    });

    it('admite varios origenes separados por coma', () => {
      process.env.CORS_ORIGENES = 'https://hce.clinica.pe,https://admin.clinica.pe';

      expect(cargarConfiguracion().origenesPermitidos).toEqual([
        'https://hce.clinica.pe',
        'https://admin.clinica.pe',
      ]);
    });

    it('tolera espacios alrededor de cada origen', () => {
      process.env.CORS_ORIGENES = ' https://uno.pe , https://dos.pe ';

      expect(cargarConfiguracion().origenesPermitidos).toEqual([
        'https://uno.pe',
        'https://dos.pe',
      ]);
    });

    it('descarta entradas vacias por una coma de mas', () => {
      process.env.CORS_ORIGENES = 'https://uno.pe,,https://dos.pe,';

      expect(cargarConfiguracion().origenesPermitidos).toHaveLength(2);
    });

    /*
     * El comodin se rechaza por dos motivos independientes. El enunciado pide
     * que la API solo la consuma el FrontEnd; y ademas, un navegador NO envia
     * cookies con credenciales a un origen comodin, asi que la sesion dejaria
     * de funcionar. Fallar al arrancar avisa de las dos cosas a la vez.
     */
    it('rechaza el comodin y no arranca', () => {
      process.env.CORS_ORIGENES = '*';

      expect(() => cargarConfiguracion()).toThrow(/comodin/);
    });

    it('tambien lo rechaza si viene mezclado con origenes validos', () => {
      process.env.CORS_ORIGENES = 'https://hce.clinica.pe,*';

      expect(() => cargarConfiguracion()).toThrow(/comodin/);
    });
  });

  describe('cookie de sesion', () => {
    /*
     * En produccion la cookie exige HTTPS por defecto; en desarrollo no, porque
     * no hay certificado en local y la cookie no llegaria nunca. El valor
     * seguro es el predeterminado donde importa, y eso es lo que se comprueba.
     */
    it('en produccion exige HTTPS sin necesidad de configurarlo', () => {
      process.env.NODE_ENV = 'production';

      expect(cargarConfiguracion().cookieSegura).toBe(true);
    });

    it('en desarrollo no lo exige, para poder trabajar en local', () => {
      process.env.NODE_ENV = 'development';

      expect(cargarConfiguracion().cookieSegura).toBe(false);
    });

    it('la configuracion explicita manda sobre el entorno', () => {
      process.env.NODE_ENV = 'development';
      process.env.COOKIE_SEGURA = 'true';

      expect(cargarConfiguracion().cookieSegura).toBe(true);
    });
  });

  describe('valores por defecto', () => {
    it('el token dura los 30 minutos que exige el enunciado', () => {
      expect(cargarConfiguracion().jwt.expiracionSegundos).toBe(1800);
    });

    it('el gateway escucha en el 4000 y los microservicios en 4001-4003', () => {
      const config = cargarConfiguracion();

      expect(config.puerto).toBe(4000);
      expect(config.microservicios.auth.puerto).toBe(4001);
      expect(config.microservicios.catalogo.puerto).toBe(4002);
      expect(config.microservicios.inventario.puerto).toBe(4003);
    });

    it('el login se limita mas que el resto de la API', () => {
      const { rateLimit } = cargarConfiguracion();

      // El login es la superficie de fuerza bruta: 5 por minuto frente a 100.
      expect(rateLimit.limiteLogin).toBeLessThan(rateLimit.limiteGeneral);
      expect(rateLimit.limiteLogin).toBe(5);
    });

    it('emisor y audiencia identifican a esta aplicacion', () => {
      const { jwt } = cargarConfiguracion();

      expect(jwt.emisor).toBe('hce-clinica-san-felipe');
      expect(jwt.audiencia).toBe('hce-frontend');
    });

    it('el prefijo de la API es "api"', () => {
      expect(cargarConfiguracion().prefijoApi).toBe('api');
    });

    it('el entorno por defecto es desarrollo', () => {
      expect(cargarConfiguracion().entorno).toBe('development');
    });
  });

  describe('valores numericos del entorno', () => {
    it('se leen y se convierten a numero', () => {
      process.env.GATEWAY_PORT = '8080';
      process.env.MS_AUTH_PORT = '5001';

      const config = cargarConfiguracion();

      expect(config.puerto).toBe(8080);
      expect(config.microservicios.auth.puerto).toBe(5001);
    });

    /*
     * Un valor no numerico cae al predeterminado en lugar de propagar NaN. Un
     * puerto NaN produce un fallo del sistema operativo muy lejos de aqui y sin
     * relacion aparente con la variable mal escrita que lo causo.
     */
    it.each([
      ['no es un numero', 'ochenta'],
      ['esta vacio', ''],
      ['es cero', '0'],
      ['es negativo', '-1'],
    ])('cae al valor por defecto si %s', (_caso, valor) => {
      process.env.GATEWAY_PORT = valor;

      expect(cargarConfiguracion().puerto).toBe(4000);
    });
  });

  describe('destinos de los microservicios', () => {
    it('se leen del entorno, que es como los inyecta Docker', () => {
      process.env.MS_AUTH_HOST = 'ms-auth';
      process.env.MS_CATALOGO_HOST = 'ms-catalogo';
      process.env.MS_INVENTARIO_HOST = 'ms-inventario';

      // En Docker el host es el nombre del servicio, no localhost.
      expect(cargarConfiguracion().microservicios).toMatchObject({
        auth: { host: 'ms-auth' },
        catalogo: { host: 'ms-catalogo' },
        inventario: { host: 'ms-inventario' },
      });
    });

    it('en local apuntan a localhost', () => {
      expect(cargarConfiguracion().microservicios.auth.host).toBe('localhost');
    });
  });
});
