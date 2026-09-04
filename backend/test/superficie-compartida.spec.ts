import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * PRUEBA DE ARQUITECTURA — La superficie de `@hce/compartido`, simbolo a simbolo.
 *
 * `regla-dependencia.spec.ts` comprueba que ninguna capa importe de una capa mas
 * externa, pero tiene un hueco deliberado: permite `@hce/compartido` entero a
 * cualquier capa, porque el paquete exporta cosas de las cuatro.
 *
 * Ese hueco es real y esta prueba lo cierra. Sin ella, un caso de uso podia
 * escribir `import { MssqlService } from '@hce/compartido'` y ninguna
 * comprobacion lo detectaba: la capa de aplicacion quedaba atada al driver de
 * base de datos sin que nada avisara.
 *
 * De hecho la auditoria que motivo este archivo encontro una violacion real:
 * `MssqlService` estaba clasificado en la capa 4 mientras las pasarelas que lo
 * usan son capa 3. Se resolvio moviendo el adaptador a su capa correcta, no
 * relajando la regla.
 *
 * MANTENIMIENTO: al anadir una exportacion a `@hce/compartido` hay que
 * declararla aqui. Si se olvida, la prueba falla con un mensaje que lo dice: es
 * intencionado, porque decidir a que capa pertenece un simbolo es justo la
 * decision que no debe tomarse por descuido.
 */

const RAIZ = join(__dirname, '..');

const ORDEN_CAPAS = ['dominio', 'aplicacion', 'adaptadores', 'infraestructura'] as const;
type Capa = (typeof ORDEN_CAPAS)[number];

/**
 * Superficie publica de `@hce/compartido`, clasificada por la capa a la que
 * pertenece cada simbolo. Es la misma division que declara `index.ts`.
 */
const CAPA_DE_SIMBOLO: Readonly<Record<string, Capa>> = {
  // --- Capa 1 · Dominio -----------------------------------------------------
  Importe: 'dominio',
  CodigoError: 'dominio',
  ErrorSerializado: 'dominio',
  ExcepcionDominio: 'dominio',
  ErrorValidacion: 'dominio',
  ErrorNoEncontrado: 'dominio',
  ErrorConflicto: 'dominio',
  ErrorStockInsuficiente: 'dominio',
  ErrorNoAutorizado: 'dominio',
  ErrorProhibido: 'dominio',
  ErrorInfraestructura: 'dominio',

  // --- Capa 2 · Aplicacion --------------------------------------------------
  CasoUso: 'aplicacion',
  CasoUsoSinPeticion: 'aplicacion',
  RegistroPuerto: 'aplicacion',
  REGISTRO_PUERTO: 'aplicacion',
  ConsultaPaginada: 'aplicacion',
  ConsultaPaginadaConBusqueda: 'aplicacion',
  MetaPaginacion: 'aplicacion',
  ResultadoPaginado: 'aplicacion',
  construirPaginado: 'aplicacion',
  LIMITES_PAGINACION: 'aplicacion',
  normalizarPaginacion: 'aplicacion',

  // --- Capa 3 · Adaptadores -------------------------------------------------
  PaginacionDto: 'adaptadores',
  PaginacionBusquedaDto: 'adaptadores',
  ExcepcionHttpFiltro: 'adaptadores',
  RespuestaError: 'adaptadores',
  ExcepcionRpcFiltro: 'adaptadores',
  PATRONES_AUTH: 'adaptadores',
  PATRONES_CATALOGO: 'adaptadores',
  PATRONES_INVENTARIO: 'adaptadores',
  CLIENTES_MICROSERVICIO: 'adaptadores',
  enviarMensaje: 'adaptadores',
  TIMEOUT_RPC_MS: 'adaptadores',
  medirTiempo: 'adaptadores',
  RegistroNest: 'adaptadores',
  MssqlService: 'adaptadores',
  ParametroSql: 'adaptadores',
  ParametroTabla: 'adaptadores',
  OpcionesEjecucion: 'adaptadores',
  ValorSql: 'adaptadores',
  FilaCruda: 'adaptadores',
  ResultadoProcedimiento: 'adaptadores',

  // --- Capa 4 · Infraestructura ---------------------------------------------
  MssqlModule: 'infraestructura',
};

interface UsoDeSimbolo {
  archivo: string;
  capaDelArchivo: Capa;
  simbolo: string;
}

function listarFuentes(directorio: string): string[] {
  const encontrados: string[] = [];

  const recorrer = (actual: string): void => {
    for (const entrada of readdirSync(actual)) {
      const ruta = join(actual, entrada);
      if (statSync(ruta).isDirectory()) {
        if (entrada !== 'node_modules' && entrada !== 'dist') recorrer(ruta);
      } else if (entrada.endsWith('.ts') && !entrada.endsWith('.spec.ts')) {
        encontrados.push(ruta);
      }
    }
  };

  recorrer(directorio);
  return encontrados;
}

function capaDe(rutaRelativa: string): Capa | null {
  const segmentos = rutaRelativa.split(sep);
  return ORDEN_CAPAS.find((capa) => segmentos.includes(capa)) ?? null;
}

/**
 * Extrae los simbolos importados desde `@hce/compartido`.
 *
 * Se recorre por bloques `import { ... } from '@hce/compartido'`, admitiendo la
 * forma `type X` que introduce `consistent-type-imports`.
 *
 * Se resuelve buscando la marca y leyendo hacia atras la lista entre llaves, en
 * vez de con una expresion regular. Un patron con cuantificadores de espacio
 * encadenados queda senalado como expuesto a retroceso catastrofico, y en un
 * archivo que recorre todo el codigo fuente esa advertencia merece atenderse en
 * lugar de silenciarse.
 */
const PREFIJO_TIPO = 'type ';
const MARCA_IMPORT = "from '@hce/compartido'";

function simbolosImportados(contenido: string): string[] {
  const simbolos: string[] = [];

  let marca = contenido.indexOf(MARCA_IMPORT);
  while (marca !== -1) {
    const cierre = contenido.lastIndexOf('}', marca);
    const apertura = cierre === -1 ? -1 : contenido.lastIndexOf('{', cierre);

    // Entre la llave de cierre y la marca solo puede haber espacios. Asi se
    // descarta un `}` que venga de codigo anterior y no de esta importacion.
    const pegado = cierre !== -1 && contenido.slice(cierre + 1, marca).trim() === '';

    const lista = apertura !== -1 && pegado ? contenido.slice(apertura + 1, cierre) : '';

    for (const bruto of lista.split(',')) {
      const entrada = bruto.trim();
      const simbolo = entrada.startsWith(PREFIJO_TIPO)
        ? entrada.slice(PREFIJO_TIPO.length).trim()
        : entrada;
      if (simbolo) simbolos.push(simbolo);
    }

    marca = contenido.indexOf(MARCA_IMPORT, marca + MARCA_IMPORT.length);
  }

  return simbolos;
}

function recolectarUsos(): UsoDeSimbolo[] {
  const modulos = [
    'libs/compartido/src',
    'apps/api-gateway/src',
    'apps/ms-auth/src',
    'apps/ms-catalogo/src',
    'apps/ms-inventario/src',
  ];

  const usos: UsoDeSimbolo[] = [];

  for (const modulo of modulos) {
    for (const archivo of listarFuentes(join(RAIZ, modulo))) {
      const relativo = relative(RAIZ, archivo);
      const capaDelArchivo = capaDe(relativo);
      if (!capaDelArchivo) continue;

      for (const simbolo of simbolosImportados(readFileSync(archivo, 'utf8'))) {
        usos.push({ archivo: relativo.replaceAll('\\', '/'), capaDelArchivo, simbolo });
      }
    }
  }

  return usos;
}

describe('Superficie de @hce/compartido', () => {
  const usos = recolectarUsos();

  it('encuentra importaciones que analizar', () => {
    // Salvaguarda: si un cambio de rutas dejara la lista vacia, la prueba
    // pasaria sin comprobar nada.
    expect(usos.length).toBeGreaterThan(20);
  });

  it('todo simbolo importado esta clasificado en alguna capa', () => {
    const desconocidos = usos
      .filter((u) => !(u.simbolo in CAPA_DE_SIMBOLO))
      .map((u) => `${u.archivo}: "${u.simbolo}" no esta clasificado en CAPA_DE_SIMBOLO`);

    expect([...new Set(desconocidos)]).toEqual([]);
  });

  it('ninguna capa importa un simbolo de una capa mas externa', () => {
    const violaciones = usos
      .filter((u) => {
        const capaDelSimbolo = CAPA_DE_SIMBOLO[u.simbolo];
        if (!capaDelSimbolo) return false;
        return (
          ORDEN_CAPAS.indexOf(capaDelSimbolo) > ORDEN_CAPAS.indexOf(u.capaDelArchivo)
        );
      })
      .map(
        (u) =>
          `${u.archivo} (capa ${u.capaDelArchivo}): importa "${u.simbolo}", ` +
          `que pertenece a la capa ${CAPA_DE_SIMBOLO[u.simbolo] ?? '?'}`,
      );

    expect([...new Set(violaciones)]).toEqual([]);
  });

  it('el dominio solo usa simbolos de dominio', () => {
    const violaciones = usos
      .filter(
        (u) => u.capaDelArchivo === 'dominio' && CAPA_DE_SIMBOLO[u.simbolo] !== 'dominio',
      )
      .map((u) => `${u.archivo}: importa "${u.simbolo}", que no es de dominio`);

    expect([...new Set(violaciones)]).toEqual([]);
  });

  it('la aplicacion no usa ningun simbolo de adaptadores ni de infraestructura', () => {
    const violaciones = usos
      .filter((u) => {
        if (u.capaDelArchivo !== 'aplicacion') return false;
        const capa = CAPA_DE_SIMBOLO[u.simbolo];
        return capa === 'adaptadores' || capa === 'infraestructura';
      })
      .map(
        (u) =>
          `${u.archivo}: importa "${u.simbolo}". Un caso de uso no puede depender ` +
          'del transporte ni del driver de base de datos.',
      );

    expect([...new Set(violaciones)]).toEqual([]);
  });
});
