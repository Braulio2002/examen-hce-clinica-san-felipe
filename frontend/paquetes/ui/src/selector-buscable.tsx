'use client';

import type React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Selector con busqueda por teclado.
 *
 * Sustituye al <select> nativo en el alta de lineas de compra y de venta. Con el
 * catalogo de demostracion daba igual, pero un almacen clinico real maneja
 * cientos de presentaciones: encontrar "Ketorolaco 30 mg" desplegando una lista
 * es inviable cuando hay un paciente esperando.
 *
 * La busqueda ignora mayusculas y tildes, e incluye los terminos secundarios de
 * cada opcion. Eso permite escribir el numero de lote -"0010"- y llegar al
 * producto directamente, que es como trabaja farmacia cuando tiene la caja en
 * la mano.
 *
 * ACCESIBILIDAD
 * Sigue el patron ARIA de combobox: el campo declara `role="combobox"` con
 * `aria-expanded` y `aria-activedescendant`, y la lista es un `listbox` cuyas
 * opciones se recorren con las flechas sin mover el foco del campo. Asi el
 * lector de pantalla anuncia cada opcion mientras se navega y el usuario puede
 * seguir escribiendo. Escape cierra, Enter confirma.
 *
 * Se mantiene el area tactil de 44 px: en planta esto se usa sobre tablet y con
 * guantes.
 */
export interface OpcionBuscable {
  id: number;
  /** Texto principal. Es lo que se muestra y lo primero que se busca. */
  etiqueta: string;
  /** Terminos adicionales que tambien encuentran la opcion (lote, codigo). */
  terminosExtra?: string;
  /** Texto secundario a la derecha: precio, stock, lo que aporte contexto. */
  nota?: string;
  /** Impide seleccionarla, pero la deja visible con su motivo. */
  deshabilitada?: boolean;
}

/** Quita tildes y pasa a minusculas para que la busqueda sea indulgente. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Decide si una opcion sobrevive al filtro.
 *
 * Se exporta para poder probarla sin montar el componente: es donde vive toda
 * la logica de busqueda, y el resto es presentacion.
 */
export function coincideOpcion(opcion: OpcionBuscable, consulta: string): boolean {
  if (consulta === '') return true;
  const heno = normalizar(`${opcion.etiqueta} ${opcion.terminosExtra ?? ''}`);
  // Cada palabra por separado: "para 500" encuentra "Paracetamol 500 mg".
  return normalizar(consulta)
    .split(/\s+/)
    .filter(Boolean)
    .every((termino) => heno.includes(termino));
}

interface Props {
  etiqueta: string;
  opciones: readonly OpcionBuscable[];
  onSeleccionar: (id: number) => void;
  cargando?: boolean;
  marcador?: string;
  ayuda?: string;
  sinResultados?: string;
}

export function SelectorBuscable({
  etiqueta,
  opciones,
  onSeleccionar,
  cargando = false,
  marcador = 'Escriba para buscar...',
  ayuda,
  sinResultados = 'Ningun producto coincide con la busqueda.',
}: Readonly<Props>): React.JSX.Element {
  const idBase = useId();
  const idLista = `${idBase}-lista`;
  const idAyuda = `${idBase}-ayuda`;

  const [consulta, setConsulta] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(0);

  const contenedor = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const visibles = useMemo(
    () => opciones.filter((o) => coincideOpcion(o, consulta)),
    [opciones, consulta],
  );

  // Al cambiar el filtro, la opcion resaltada anterior deja de tener sentido.
  useEffect(() => setResaltada(0), [consulta]);

  // Un clic fuera cierra la lista: es lo que el usuario espera de un desplegable.
  useEffect(() => {
    if (!abierto) return;

    const alPulsarFuera = (evento: MouseEvent): void => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alPulsarFuera);
    return () => document.removeEventListener('mousedown', alPulsarFuera);
  }, [abierto]);

  // La opcion resaltada debe verse aunque se navegue con el teclado.
  useEffect(() => {
    listaRef.current?.children[resaltada]?.scrollIntoView({ block: 'nearest' });
  }, [resaltada]);

  const elegir = (opcion: OpcionBuscable | undefined): void => {
    if (!opcion || opcion.deshabilitada) return;
    onSeleccionar(opcion.id);
    // Se vacia el campo: tras anadir una linea, lo siguiente es buscar otra.
    setConsulta('');
    setAbierto(false);
  };

  const mover = (paso: number): void => {
    setAbierto(true);
    setResaltada((actual) => {
      if (visibles.length === 0) return 0;
      return (actual + paso + visibles.length) % visibles.length;
    });
  };

  const alPulsarTecla = (evento: React.KeyboardEvent<HTMLInputElement>): void => {
    // El valor es opcional a proposito: la mayoria de las teclas no estan en
    // el mapa, y sin el `undefined` el compilador da por buena una entrada que
    // no existe.
    const teclas: Record<string, (() => void) | undefined> = {
      ArrowDown: () => mover(1),
      ArrowUp: () => mover(-1),
      Home: () => setResaltada(0),
      End: () => setResaltada(Math.max(0, visibles.length - 1)),
      Enter: () => elegir(visibles[resaltada]),
      Escape: () => setAbierto(false),
    };

    const accion = teclas[evento.key];
    if (!accion) return;
    evento.preventDefault();
    accion();
  };

  const idOpcion = (indice: number): string => `${idBase}-opcion-${String(indice)}`;

  return (
    <div ref={contenedor} className="relative">
      <label htmlFor={idBase} className="mb-1.5 block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>

      <input
        id={idBase}
        type="text"
        role="combobox"
        autoComplete="off"
        disabled={cargando}
        value={consulta}
        placeholder={cargando ? 'Cargando catalogo...' : marcador}
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-describedby={ayuda ? idAyuda : undefined}
        aria-activedescendant={
          abierto && visibles.length > 0 ? idOpcion(resaltada) : undefined
        }
        onChange={(e) => {
          setConsulta(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alPulsarTecla}
        className="block min-h-[44px] w-full rounded-lg border-0 px-3 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-clinica-600"
      />

      {ayuda && (
        <p id={idAyuda} className="mt-1.5 text-sm text-slate-500">
          {ayuda}
        </p>
      )}

      {abierto && !cargando && (
        <div
          ref={listaRef}
          id={idLista}
          role="listbox"
          aria-label={etiqueta}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200"
        >
          {visibles.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-slate-500">{sinResultados}</p>
          )}

          {visibles.map((opcion, indice) => (
            <div
              key={opcion.id}
              id={idOpcion(indice)}
              role="option"
              // Enfocable pero fuera del recorrido del tabulador: en el patron
              // `aria-activedescendant` el foco real no se mueve del campo, y
              // es el navegador quien anuncia la opcion activa.
              tabIndex={-1}
              aria-selected={indice === resaltada}
              aria-disabled={opcion.deshabilitada}
              onMouseEnter={() => setResaltada(indice)}
              onMouseDown={(e) => {
                // Evita que el campo pierda el foco antes de procesar el clic.
                e.preventDefault();
                elegir(opcion);
              }}
              className={[
                'flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm',
                indice === resaltada ? 'bg-clinica-50' : '',
                opcion.deshabilitada
                  ? 'cursor-not-allowed text-slate-400'
                  : 'text-slate-900',
              ].join(' ')}
            >
              <span>{opcion.etiqueta}</span>
              {opcion.nota && (
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  {opcion.nota}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
