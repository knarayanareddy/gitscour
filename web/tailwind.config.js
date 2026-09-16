/** @type {import('tailwindcss').Config} */

/**
 * Obsidian Dark — design tokens
 *
 * A near-black, monochrome surface system. Depth is carried by hairline
 * white borders (never by colored fills), and every quantitative readout is
 * set in monospace with tabular numerals so columns of numbers stay aligned.
 *
 *   --obs-base     #07080a  page canvas
 *   --obs-inset    #050608  wells inside cards (inputs, code, stat rows)
 *   --obs-surface  #0c0e12  cards / panels
 *   --obs-raised   #101216  modal chrome, sticky bars, hover state
 *   --obs-line     rgba(255,255,255,0.08)  hairline border
 *
 * Accent is intentionally achromatic: white at varying alpha. Semantic hues
 * (amber = stars, emerald = verified, rose = friction) are reserved for state
 * and are desaturated so they read as signal, not decoration.
 */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obs: {
          base: '#07080a',
          inset: '#050608',
          surface: '#0c0e12',
          raised: '#101216',
          // Text ramp (mirrors the --obs-* vars). Markup mostly uses the
          // neutral zinc ramp; these exist for surface-matched text.
          ink: '#eceef2',
          muted: '#8f949e',
          faint: '#61656d',
        },
        // Reserved semantic signal colors (deliberately muted)
        signal: {
          star: '#d8b26a',
          ok: '#7fbf9b',
          warn: '#d0a06a',
          risk: '#c98375',
          info: '#8aa7c4',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'JetBrains Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      borderColor: {
        // `border` on its own now draws a white hairline.
        DEFAULT: 'rgba(255, 255, 255, 0.08)',
      },
      boxShadow: {
        'hairline': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
        'panel': '0 30px 70px -40px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.06)',
        'lift': '0 12px 34px -22px rgba(0, 0, 0, 0.9)',
      },
      backgroundImage: {
        'obs-sheen': 'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0) 60%)',
      },
    },
  },
  plugins: [],
}
