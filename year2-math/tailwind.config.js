/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Baloo 2"', 'cursive'],
        body: ['Nunito', 'sans-serif'],
      },
      colors: {
        speed: {
          blue: '#4a90e2',
          bluedark: '#3a76bd',
          bluelight: '#e8f1fc',
        },
        ink: '#3c3c3c',
        paper: '#f7fafd',
      },
      boxShadow: {
        pop: '0 4px 0 0 rgba(0,0,0,0.2)',
      },
      keyframes: {
        'float-y': {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'bob': {
          '0%,100%': { transform: 'translateY(0) rotate(-1deg)' },
          '50%': { transform: 'translateY(-4px) rotate(1deg)' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.6) translateY(24px)', opacity: '0' },
          '60%': { transform: 'scale(1.05) translateY(-4px)', opacity: '1' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        'shake-x': {
          '0%,100%': { transform: 'translateX(0)' },
          '20%,60%': { transform: 'translateX(-6px)' },
          '40%,80%': { transform: 'translateX(6px)' },
        },
        'dash-run': {
          '0%': { transform: 'translateX(-110%)' },
          '100%': { transform: 'translateX(210vw)' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'flame-flicker': {
          '0%,100%': { transform: 'scaleY(1) scaleX(1)' },
          '50%': { transform: 'scaleY(1.15) scaleX(0.92)' },
        },
      },
      animation: {
        'float-y': 'float-y 2.4s ease-in-out infinite',
        'bob': 'bob 1.8s ease-in-out infinite',
        'pop-in': 'pop-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        'shake-x': 'shake-x 0.4s ease-in-out both',
        'dash-run': 'dash-run 14s linear infinite',
        'spin-slow': 'spin-slow 9s linear infinite',
        'flame-flicker': 'flame-flicker 0.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
