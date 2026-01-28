/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 uses the content array to determine which files to scan
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  // Use NativeWind preset for React Native compatibility
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // FilmGallery Brand Colors (synchronized with src/theme.js)
      colors: {
        primary: {
          DEFAULT: '#5A4632',    // Warm brown - main brand color
          light: '#E9DCCF',      // Light beige - for containers
          dark: '#3B3024',       // Dark brown - for emphasis
        },
        secondary: {
          DEFAULT: '#3E6B64',    // Teal
          light: '#CCE5E1',      // Light teal
          dark: '#2A4A45',       // Dark teal
        },
        accent: '#FF9E9E',       // Soft pink for highlights
        surface: {
          light: '#F5F0E6',      // Warm gray surface
          DEFAULT: '#FAF9F7',    // Off-white background
          dark: '#121315',       // Dark mode surface
        },
        'surface-variant': {
          DEFAULT: '#EBE3D8',
          dark: '#1E1E20',
        },
        outline: {
          DEFAULT: '#D6CFC4',
          dark: '#2A2A2A',
        },
        // Semantic colors
        success: '#4CAF50',
        warning: '#FFB347',
        error: '#B00020',
        // Text colors
        'text-primary': {
          DEFAULT: '#3B3024',
          dark: '#EDEBE9',
        },
        'text-secondary': {
          DEFAULT: '#6A6258',
          dark: '#A8A29E',
        },
      },
      // Spacing tokens (matching existing theme.js)
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
        '2xl': '32px',
        '3xl': '48px',
      },
      // Border radius tokens
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '16px',
        'xl': '20px',
        '2xl': '24px',
      },
      // Font configuration (use system fonts for RN)
      fontFamily: {
        sans: ['System'],
        heading: ['System'],
      },
      // Font size with line height
      fontSize: {
        'xs': ['12px', { lineHeight: '16px' }],
        'sm': ['14px', { lineHeight: '20px' }],
        'base': ['16px', { lineHeight: '24px' }],
        'lg': ['18px', { lineHeight: '28px' }],
        'xl': ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
        '4xl': ['36px', { lineHeight: '40px' }],
      },
      // Box shadow (elevation in RN)
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.1)',
        'overlay': '0 4px 16px rgba(0, 0, 0, 0.15)',
      },
    },
  },
  plugins: [],
};
