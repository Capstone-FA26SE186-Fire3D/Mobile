import { Appearance } from 'react-native';

// FET3D Mobile v2 "game" palette from Figma (08 Mobile App v2). Light mode only swaps tokens;
// hard shadows, hex badges, ribbons and the diorama keep the same colours in both modes.
const dark = {
  bg: '#141719',
  bgSoft: '#191D1F',
  surface: '#202629',
  surfaceRaised: '#283033',
  text: '#F3F5F4',
  muted: '#B8C1C4',
  dim: '#939DA0',
  line: 'rgba(243,245,244,0.12)',
  lineStrong: 'rgba(243,245,244,0.25)',
  ember: '#EE8654',
  emberSoft: 'rgba(238,134,84,0.12)',
  emberForeground: '#141719',
  success: '#5FD08A',
  successSoft: 'rgba(95,208,138,0.13)',
  danger: '#FF8F8F',
  dangerSoft: 'rgba(255,143,143,0.13)',
  warning: '#F2C14E',
  warningSoft: 'rgba(242,193,78,0.13)',
  info: '#7FB7FF',
  infoSoft: 'rgba(127,183,255,0.13)',
};
const light: typeof dark = {
  bg: '#ECEFF0',
  bgSoft: '#F5F7F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  text: '#171B1D',
  muted: '#3F4A4E',
  dim: '#5D686B',
  line: 'rgba(23,27,29,0.12)',
  lineStrong: 'rgba(23,27,29,0.3)',
  ember: '#AC4410',
  emberSoft: 'rgba(172,68,16,0.09)',
  emberForeground: '#FFFFFF',
  success: '#1F7A45',
  successSoft: 'rgba(31,122,69,0.1)',
  danger: '#B3261E',
  dangerSoft: 'rgba(179,38,30,0.09)',
  warning: '#8A5A00',
  warningSoft: 'rgba(138,90,0,0.11)',
  info: '#1856A6',
  infoSoft: 'rgba(24,86,166,0.09)',
};

/** Picked once at start-up: styles are created with StyleSheet at module load. */
export const scheme: 'dark' | 'light' = Appearance.getColorScheme() === 'light' ? 'light' : 'dark';

export const colors = {
  ...(scheme === 'light' ? light : dark),
  // Mode-independent "game" colours.
  ribbon: '#EE8654',
  emberShadow: '#A44F26',
  hardShadow: '#0B0D0E',
  ink: '#141719',
  exit: '#2FBF71',
  white: '#FFFFFF',
  hex: {
    ember: '#EE8654',
    success: '#5FD08A',
    info: '#7FB7FF',
    warning: '#F2C14E',
    danger: '#FF8F8F',
    neutral: '#939DA0',
    exit: '#2FBF71',
  },
} as const;

export type HexTone = keyof typeof colors.hex;

export const fonts = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  extrabold: 'BeVietnamPro_800ExtraBold',
  black: 'BeVietnamPro_900Black',
} as const;
