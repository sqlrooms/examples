import {sqlroomsTailwindPreset} from '@sqlrooms/ui';
import type {Config} from 'tailwindcss';

const preset = sqlroomsTailwindPreset({prefix: ''});
const config = {
  ...preset,
  content: [
    'src/**/*.{ts,tsx}',
    // @sqlrooms-packages-content-start
    './node_modules/@sqlrooms/**/dist/**/*.js',
    // @sqlrooms-packages-content-end
  ],
  theme: {
    ...preset.theme,
    extend: {
      ...preset.theme?.extend,
    },
  },
} satisfies Config;

export default config;
