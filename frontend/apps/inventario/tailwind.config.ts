import type { Config } from 'tailwindcss';

/**
 * Paleta institucional derivada de la identidad de Clinica San Felipe
 * (verde sanitario + azul confianza). Se define como escala completa para que
 * ambas zonas del microfront se vean como una sola aplicacion.
 */
const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    // Los componentes compartidos viven fuera de la app: sin esta ruta Tailwind
    // no genera sus clases y el paquete @hce/ui se renderiza sin estilos.
    '../../paquetes/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        clinica: {
          50: '#eefdf3',
          100: '#d6f9e2',
          200: '#b0f1ca',
          300: '#7ae5ac',
          400: '#3fd189',
          500: '#18b76c',
          600: '#0c9457',
          700: '#0b7648',
          800: '#0d5d3b',
          900: '#0c4d33',
          950: '#032b1c',
        },
        acento: {
          50: '#eff8ff',
          100: '#dbeefe',
          200: '#bfe2fe',
          300: '#93d1fd',
          400: '#60b6fa',
          500: '#3b97f6',
          600: '#2579eb',
          700: '#1d63d8',
          800: '#1e51af',
          900: '#1e468a',
        },
      },
      fontFamily: {
        sans: ['var(--fuente-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
