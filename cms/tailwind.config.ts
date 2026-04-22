import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './layout/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}'
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'loop-scroll': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-100%)' }
        },
        brightness: {
          from: { filter: 'brightness(1)' },
          '50%': { filter: 'brightness(1.1)' },
          to: { filter: 'brightness(1)' }
        },
        pulseWeak: {
          from: { opacity: '30%' },
          '50%': { opacity: '50%' },
          to: { opacity: '30%' }
        },
        bounceWithFade: {
          '0%': {
            transform: 'translateY(-100%)',
            opacity: '0',
            animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)'
          },
          '5%': {
            transform: 'translateY(0)',
            opacity: '1',
            animationTimingFunction: 'cubic-bezier(0.2, 0, 0.5, 1)'
          },
          '50%': {
            transform: 'translateY(0)',
            opacity: '1',
            animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)'
          },
          '90%': {
            transform: 'translateY(0)',
            opacity: '1',
            animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)'
          },
          '100%': {
            transform: 'translateY(-100%)',
            opacity: '0',
            animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)'
          }
        },
        appear: {
          '0%': {
            opacity: '0',
            transform: 'translateY(-80px) scale(0.9)'
          },
          '40%': {
            opacity: '0.8',
            transform: 'translateY(10px) scale(1.02)'
          },
          '60%': {
            opacity: '0.9',
            transform: 'translateY(-5px) scale(0.98)'
          },
          '80%': {
            opacity: '0.95',
            transform: 'translateY(2px) scale(1.01)'
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0) scale(1)'
          }
        },
        opacity: {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        flip: {
          '0%, 100%': {
            transform: 'skew(0deg, 0deg)',
            'border-radius': '0',
            opacity: '0.5'
          },
          '50%': {
            transform: 'skew(90deg, 60deg)',
            'border-radius': '90px',
            opacity: '0.2'
          }
        },
        hover: {
          '0%, 100%': {
            transform: 'translateY(-4%)'
          },
          '50%': {
            transform: 'translateY(0)'
          }
        },
        colormax: {
          '0%, 100%': {
            filter: 'hue-rotate(0deg)'
          },
          '50%': {
            filter: 'hue-rotate(360deg)'
          }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'loop-scroll': 'loop-scroll 50s linear infinite',
        hover: 'hover 5s infinite;',
        hoverSlow: 'hover 25s infinite;',
        colormax: 'colormax 15s infinite;',
        'spin-slow': 'spin 10s infinite;',
        flip: 'flip 10s infinite;',
        appear: 'appear 0.6s linear',
        opacity: 'opacity 1s;',
        bounceWithFade: 'bounceWithFade 2.5s ease-in-out',
        brightness: 'brightness 3s ease-in-out infinite',
        pulseWeak: 'pulseWeak 3s ease-in-out infinite'
      },
      fontFamily: {
        primary: ['Passion One', 'sans-serif'],
        secondary: ['Bebas Neue', 'sans-serif'],
        tertiary: ['Nunito', 'sans-serif'],
        pixel: ['Pixelify Sans', 'sans-serif'],
        paws: ['paws', 'sans-serif']
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
} satisfies Config;
