// Six selectable themes (the original app's "Themes" feature). "night" is a full dark mode.
const light = { bg: '#F4F6F8', card: '#FFFFFF', ink: '#15202B', muted: '#65758A', line: '#E1E7ED', danger: '#DC2626', success: '#16A34A', gold: '#F5A623', dark: false };
export const THEMES = {
  teal: { ...light, primary: '#0891B2', primaryDark: '#0E7490', soft: '#E0F7FA' },
  indigo: { ...light, primary: '#4F46E5', primaryDark: '#3730A3', soft: '#E9E8FD' },
  rose: { ...light, primary: '#E11D48', primaryDark: '#9F1239', soft: '#FDE7EC' },
  amber: { ...light, primary: '#C2410C', primaryDark: '#9A3412', soft: '#FDEBDD' },
  forest: { ...light, primary: '#15803D', primaryDark: '#14532D', soft: '#E1F4E7' },
  night: {
    bg: '#0E151C', card: '#17212B', ink: '#E7EDF3', muted: '#8C9DB0', line: '#24313E', danger: '#F87171', success: '#4ADE80', gold: '#FBBF24',
    primary: '#5CC2D6', primaryDark: '#0E151C', soft: '#18303A', dark: true,
  },
};
export const THEME_KEYS = Object.keys(THEMES);
export const radius = { sm: 10, md: 16, lg: 24 };
