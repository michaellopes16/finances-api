import { defaultConfig } from '@tamagui/config/v5'
import { createTamagui } from '@tamagui/core'

// Nosso tema Dark Neon customizado ajustado para a v5
const darkNeonTheme = {
  background: '#121214',
  backgroundHover: '#202024',
  backgroundPress: '#29292e',
  backgroundFocus: '#202024',
  backgroundStrong: '#202024', // Cor dos Cards
  color: '#e1e1e6', // Texto principal (Off-white)
  colorHover: '#fff',
  colorPress: '#fff',
  colorFocus: '#fff',
  colorMuted: '#a8a8b3', // Texto secundário
  borderColor: '#323238', // Bordas dos cards
  borderColorHover: '#8257e5',
  placeholderColor: '#7c7c8a',
  primary: '#8257E5',
  success: '#04D361', // Verde rendas
  danger: '#F75A68',  // Vermelho despesas
  info: '#00B37E',    // Verde esmeralda investimentos
}

export const config = createTamagui({
  ...defaultConfig,
  themes: {
    ...defaultConfig.themes,
    dark: {
      ...defaultConfig.themes.dark,
      ...darkNeonTheme,
    },
    light: {
      ...defaultConfig.themes.light,
      ...darkNeonTheme, // Forçando o padrão darkneon para manter a identidade visual escolhida
    },
  },
})

type Conf = typeof config

declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends Conf {}
}

export default config