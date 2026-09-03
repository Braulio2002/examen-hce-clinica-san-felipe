import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * PRUEBA DE ARQUITECTURA — La regla de dependencia de Clean Architecture.
 *
 * En Clean Architecture las dependencias del código apuntan SIEMPRE hacia
 * adentro: una capa solo puede conocer a las más internas que ella.
 *
 *      dominio  <—  aplicacion  <—  adaptadores  <—  infraestructura
 *
 * Esa regla suele quedar escrita en un README y erosionarse en el primer sprint
 * con prisa, porque nada la comprueba. Aquí sí: esta prueba recorre el código
 * fuente, analiza cada `import` y falla si alguna capa mira hacia afuera.
 *
 * Verifica dos invariantes:
 *
 *   1. Ninguna capa importa de una capa más externa.
 *   2. El dominio y la aplicación no importan NINGÚN framework: ni NestJS, ni
 *      el driver de SQL Server, ni Express, ni bcrypt. Ésta es la garantía de
 *      que la lógica clínica puede probarse y migrarse sin arrastrar el stack.
 *
 * Si esta prueba falla, no se ha roto una convención de estilo: se ha roto la
 * arquitectura.
 */

const RAIZ = join(__dirname, '..');

/** Orden de las capas, de la más interna (0) a la más externa (3). */
const ORDEN_CAPAS = ['dominio', 'aplicacion', 'adaptadores', 'infraestructura'] as const;
type Capa = (typeof ORDEN_CAPAS)[number];

/**
 * Paquetes que el dominio y la aplicación NO pueden importar.
 * Son detalles de entrega o de infraestructura, no reglas de negocio.
 */
const FRAMEWORKS_PROHIBIDOS = [
  '@nestjs/',
  'mssql',
  'express',
  'bcryptjs',
  'passport',
  'class-validator',
  'class-transformer',
  'rxjs',
];

/** Devuelve todos los archivos .ts (sin pruebas) bajo un directorio. */
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

/** Extrae los especificadores de todos los `import ... from '...'` del archivo. */
function extraerImports(contenido: string): string[] {
  const especificadores: string[] = [];
  const patron = /(?:^|\n)\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/g;

  let coincidencia: RegExpExecArray | null;
  while ((coincidencia = patron.exec(contenido)) !== null) {
    especificadores.push(coincidencia[1]);
  }
  return especificadores;
}

/** Determina a qué capa pertenece una ruta de archivo, si es que pertenece a alguna. */
function capaDe(rutaRelativa: string): Capa | null {
  const segmentos = rutaRelativa.split(sep);
  return (ORDEN_CAPAS.find((capa) => segmentos.includes(capa)) as Capa) ?? null;
}

/**
 * Determina la capa destino de un import relativo, resolviéndolo contra el
 * archivo que lo declara.
 */
function capaDestino(rutaArchivo: string, especificador: string): Capa | null {
  if (!especificador.startsWith('.')) return null;

  const directorio = join(rutaArchivo, '..');
  const resuelto = join(directorio, especificador);
  return capaDe(relative(RAIZ, resuelto));
}

interface Violacion {
  archivo: string;
  desde: Capa;
  hacia: string;
  motivo: string;
}

describe('Regla de dependencia de Clean Architecture', () => {
  const modulos = ['libs/compartido/src', 'apps/ms-auth/src', 'apps/ms-catalogo/src', 'apps/ms-inventario/src'];

  const archivos = modulos.flatMap((modulo) => listarFuentes(join(RAIZ, modulo)));

  it('encuentra archivos que analizar', () => {
    // Salvaguarda: si un cambio de rutas dejara la lista vacía, la prueba
    // pasaría sin comprobar nada y daría una falsa sensación de seguridad.
    expect(archivos.length).toBeGreaterThan(30);
  });

  it('ninguna capa importa de una capa mas externa', () => {
    const violaciones: Violacion[] = [];

    for (const archivo of archivos) {
      const origen = capaDe(relative(RAIZ, archivo));
      if (!origen) continue;

      for (const especificador of extraerImports(readFileSync(archivo, 'utf8'))) {
        const destino = capaDestino(archivo, especificador);
        if (!destino) continue;

        if (ORDEN_CAPAS.indexOf(destino) > ORDEN_CAPAS.indexOf(origen)) {
          violaciones.push({
            archivo: relative(RAIZ, archivo),
            desde: origen,
            hacia: especificador,
            motivo: `la capa "${origen}" no puede depender de "${destino}"`,
          });
        }
      }
    }

    expect(formatear(violaciones)).toEqual([]);
  });

  it('el dominio y la aplicacion no dependen de ningun framework', () => {
    const violaciones: Violacion[] = [];

    for (const archivo of archivos) {
      const origen = capaDe(relative(RAIZ, archivo));
      if (origen !== 'dominio' && origen !== 'aplicacion') continue;

      for (const especificador of extraerImports(readFileSync(archivo, 'utf8'))) {
        const prohibido = FRAMEWORKS_PROHIBIDOS.find(
          (paquete) => especificador === paquete || especificador.startsWith(paquete),
        );

        if (prohibido) {
          violaciones.push({
            archivo: relative(RAIZ, archivo),
            desde: origen,
            hacia: especificador,
            motivo: `la capa "${origen}" debe ser independiente de "${prohibido}"`,
          });
        }
      }
    }

    expect(formatear(violaciones)).toEqual([]);
  });

  it('el dominio solo importa del propio dominio', () => {
    const violaciones: Violacion[] = [];

    for (const archivo of archivos) {
      if (capaDe(relative(RAIZ, archivo)) !== 'dominio') continue;

      for (const especificador of extraerImports(readFileSync(archivo, 'utf8'))) {
        // Se permite importar la librería compartida: su superficie de dominio
        // (el value object Importe y las excepciones) es dominio también.
        const permitido =
          especificador.startsWith('.') ||
          especificador === '@hce/compartido' ||
          especificador.startsWith('node:');

        if (!permitido) {
          violaciones.push({
            archivo: relative(RAIZ, archivo),
            desde: 'dominio',
            hacia: especificador,
            motivo: 'el dominio no puede depender de paquetes externos',
          });
        }
      }
    }

    expect(formatear(violaciones)).toEqual([]);
  });
});

/** Mensaje legible: al fallar, Jest muestra exactamente qué import romper. */
function formatear(violaciones: Violacion[]): string[] {
  return violaciones.map((v) => `${v.archivo}: importa "${v.hacia}" — ${v.motivo}`);
}
