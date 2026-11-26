import type { AccentThemeId, ThemeMode } from '../types/index.ts';

export interface ThemePaletteTokens {
  canvasBg: string;
  surfaceCard: string;
  surfaceSand: string;
  surfaceDock: string;
  borderHairline: string;
  inkPrimary: string;
  inkSecondary: string;
  accentPrimary: string;
  accentPrimaryHover: string;
  accentSecondary: string;
  accentSecondarySoft: string;
  accentSecondaryBorder: string;
  bentoDarkBg: string;
  bentoDarkInner: string;
  semanticOlive: string;
  semanticCrimson: string;
  heatmap: [string, string, string, string, string];
  chartGrid: string;
  chartAxis: string;
  chartPrimary: string;
  chartSecondary: string;
  chartMuted: string;
}

export interface CuratedAccentTheme {
  id: AccentThemeId;
  name: string;
  shortName: string;
  tagline: string;
  swatchPrimary: string;
  swatchSecondary: string;
  light: ThemePaletteTokens;
  dark: ThemePaletteTokens;
}

export const THEME_BOOT_STORAGE_KEY = 'gate27_theme_boot_v1';

export const VALID_ACCENT_THEMES: readonly AccentThemeId[] = [
  'brown',
  'green',
  'red',
  'blue',
  'teal',
  'graphite',
  'navy',
  'olive',
] as const;

export const ACCENT_THEMES: readonly CuratedAccentTheme[] = [
  {
    id: 'brown',
    name: 'Heritage Brown & Gold',
    shortName: 'Heritage',
    tagline: 'IIT Madras Maroon-Brown & Imperial Gold',
    swatchPrimary: '#6E261A',
    swatchSecondary: '#C89216',
    light: {
      canvasBg: '#FAF8F4',
      surfaceCard: '#FFFFFF',
      surfaceSand: '#F4EFE6',
      surfaceDock: '#EFE9DF',
      borderHairline: '#E8E0D5',
      inkPrimary: '#1C1613',
      inkSecondary: '#61554D',
      accentPrimary: '#6E261A',
      accentPrimaryHover: '#571C13',
      accentSecondary: '#C89216',
      accentSecondarySoft: '#FDF6E3',
      accentSecondaryBorder: '#EED89A',
      bentoDarkBg: '#241914',
      bentoDarkInner: '#2C221D',
      semanticOlive: '#2E5E3E',
      semanticCrimson: '#B83227',
      heatmap: ['#F2ECE2', '#F3DCA0', '#D9A126', '#9E5322', '#6E261A'],
      chartGrid: '#EFE9DF',
      chartAxis: '#61554D',
      chartPrimary: '#6E261A',
      chartSecondary: '#C89216',
      chartMuted: '#D9CBB9',
    },
    dark: {
      canvasBg: '#130F0D',
      surfaceCard: '#1C1714',
      surfaceSand: '#241D19',
      surfaceDock: '#261E1A',
      borderHairline: '#2E2520',
      inkPrimary: '#F5F0E8',
      inkSecondary: '#A99B8E',
      accentPrimary: '#9E3E2E',
      accentPrimaryHover: '#B54A38',
      accentSecondary: '#E0A92E',
      accentSecondarySoft: '#2C2215',
      accentSecondaryBorder: '#5C441B',
      bentoDarkBg: '#171311',
      bentoDarkInner: '#221915',
      semanticOlive: '#4E8B63',
      semanticCrimson: '#D95347',
      heatmap: ['#261E1A', '#5C441B', '#9C6D18', '#C89216', '#E0A92E'],
      chartGrid: '#2E2520',
      chartAxis: '#A99B8E',
      chartPrimary: '#B54A38',
      chartSecondary: '#E0A92E',
      chartMuted: '#4B3A31',
    },
  },
  {
    id: 'green',
    name: 'Forest Green',
    shortName: 'Forest',
    tagline: 'Deep Pine & Botanical Sage',
    swatchPrimary: '#1E6045',
    swatchSecondary: '#4D8B6F',
    light: {
      canvasBg: '#FAF9F6',
      surfaceCard: '#FFFFFF',
      surfaceSand: '#F0F5F2',
      surfaceDock: '#E6EFEA',
      borderHairline: '#DCE6DF',
      inkPrimary: '#15201B',
      inkSecondary: '#4D6157',
      accentPrimary: '#1E6045',
      accentPrimaryHover: '#164B35',
      accentSecondary: '#4D8B6F',
      accentSecondarySoft: '#ECF6F1',
      accentSecondaryBorder: '#BBDAC9',
      bentoDarkBg: '#1B2B24',
      bentoDarkInner: '#23362E',
      semanticOlive: '#2E5E3E',
      semanticCrimson: '#B83227',
      heatmap: ['#EAF0EC', '#C3DFD1', '#7EB59B', '#3E8264', '#1E6045'],
      chartGrid: '#E4EDE8',
      chartAxis: '#4D6157',
      chartPrimary: '#1E6045',
      chartSecondary: '#4D8B6F',
      chartMuted: '#C7D8CF',
    },
    dark: {
      canvasBg: '#111412',
      surfaceCard: '#171D1A',
      surfaceSand: '#1E2722',
      surfaceDock: '#222C27',
      borderHairline: '#29362F',
      inkPrimary: '#EEF4F0',
      inkSecondary: '#98ADA2',
      accentPrimary: '#2E8B63',
      accentPrimaryHover: '#38A274',
      accentSecondary: '#5CB88A',
      accentSecondarySoft: '#162920',
      accentSecondaryBorder: '#2A5741',
      bentoDarkBg: '#141F1A',
      bentoDarkInner: '#1D2C25',
      semanticOlive: '#5CB88A',
      semanticCrimson: '#E06B60',
      heatmap: ['#1E2722', '#214534', '#2C6A4D', '#3D926B', '#5CB88A'],
      chartGrid: '#29362F',
      chartAxis: '#98ADA2',
      chartPrimary: '#2E8B63',
      chartSecondary: '#5CB88A',
      chartMuted: '#35483E',
    },
  },
  {
    id: 'red',
    name: 'Crimson Red',
    shortName: 'Crimson',
    tagline: 'Scholarly Crimson & Warm Amber',
    swatchPrimary: '#9B1C1C',
    swatchSecondary: '#D97706',
    light: {
      canvasBg: '#FBF8F8',
      surfaceCard: '#FFFFFF',
      surfaceSand: '#F7EFEF',
      surfaceDock: '#F1E6E6',
      borderHairline: '#E9DADA',
      inkPrimary: '#211414',
      inkSecondary: '#665050',
      accentPrimary: '#9B1C1C',
      accentPrimaryHover: '#7E1616',
      accentSecondary: '#D97706',
      accentSecondarySoft: '#FEF4E6',
      accentSecondaryBorder: '#F3CFA0',
      bentoDarkBg: '#261616',
      bentoDarkInner: '#311E1E',
      semanticOlive: '#2E5E3E',
      semanticCrimson: '#B83227',
      heatmap: ['#F3EAEA', '#F6D1C1', '#E59759', '#C74B36', '#9B1C1C'],
      chartGrid: '#EFE2E2',
      chartAxis: '#665050',
      chartPrimary: '#9B1C1C',
      chartSecondary: '#D97706',
      chartMuted: '#DEC8C8',
    },
    dark: {
      canvasBg: '#141010',
      surfaceCard: '#1D1717',
      surfaceSand: '#261E1E',
      surfaceDock: '#2B2121',
      borderHairline: '#362727',
      inkPrimary: '#F7F0F0',
      inkSecondary: '#B39C9C',
      accentPrimary: '#C53030',
      accentPrimaryHover: '#DC3B3B',
      accentSecondary: '#F08A5D',
      accentSecondarySoft: '#2E1E19',
      accentSecondaryBorder: '#633A2B',
      bentoDarkBg: '#1C1313',
      bentoDarkInner: '#271B1B',
      semanticOlive: '#5CB88A',
      semanticCrimson: '#F0746A',
      heatmap: ['#261E1E', '#572822', '#8C352C', '#C54A3A', '#F08A5D'],
      chartGrid: '#362727',
      chartAxis: '#B39C9C',
      chartPrimary: '#C53030',
      chartSecondary: '#F08A5D',
      chartMuted: '#4D3838',
    },
  },
  {
    id: 'blue',
    name: 'Cobalt Blue',
    shortName: 'Cobalt',
    tagline: 'Clean Cobalt & Sky Steel',
    swatchPrimary: '#1D4ED8',
    swatchSecondary: '#0284C7',
    light: {
      canvasBg: '#F8FAFC',
      surfaceCard: '#FFFFFF',
      surfaceSand: '#EFF4FA',
      surfaceDock: '#E5EEF8',
      borderHairline: '#D8E3F0',
      inkPrimary: '#111A2B',
      inkSecondary: '#4B5C75',
      accentPrimary: '#1D4ED8',
      accentPrimaryHover: '#173EB0',
      accentSecondary: '#0284C7',
      accentSecondarySoft: '#EAF4FD',
      accentSecondaryBorder: '#B7DAF6',
      bentoDarkBg: '#162032',
      bentoDarkInner: '#1E2C44',
      semanticOlive: '#2E5E3E',
      semanticCrimson: '#B83227',
      heatmap: ['#EBF1F8', '#BFDBFE', '#60A5FA', '#2563EB', '#1D4ED8'],
      chartGrid: '#E2EAF4',
      chartAxis: '#4B5C75',
      chartPrimary: '#1D4ED8',
      chartSecondary: '#0284C7',
      chartMuted: '#C5D4E8',
    },
    dark: {
      canvasBg: '#0E131B',
      surfaceCard: '#151C28',
      surfaceSand: '#1B2535',
      surfaceDock: '#202B3D',
      borderHairline: '#28354B',
      inkPrimary: '#EDF3FA',
      inkSecondary: '#94A6BF',
      accentPrimary: '#3B82F6',
      accentPrimaryHover: '#5393F8',
      accentSecondary: '#38BDF8',
      accentSecondarySoft: '#132538',
      accentSecondaryBorder: '#244A6E',
      bentoDarkBg: '#111927',
      bentoDarkInner: '#192438',
      semanticOlive: '#5CB88A',
      semanticCrimson: '#E06B60',
      heatmap: ['#1B2535', '#1C3A63', '#235699', '#2E78D4', '#38BDF8'],
      chartGrid: '#28354B',
      chartAxis: '#94A6BF',
      chartPrimary: '#3B82F6',
      chartSecondary: '#38BDF8',
      chartMuted: '#344663',
    },
  },
  {
    id: 'teal',
    name: 'Nordic Teal & Warm Bronze',
    shortName: 'Nordic',
    tagline: 'Deep Fjord Teal & Burnished Bronze',
    swatchPrimary: '#0F5C5C',
    swatchSecondary: '#B87D3B',
    light: {
      canvasBg: '#F7F9F8',
      surfaceCard: '#FFFFFF',
      surfaceSand: '#EDF4F3',
      surfaceDock: '#E3EEEC',
      borderHairline: '#D6E4E2',
      inkPrimary: '#122020',
      inkSecondary: '#4B6161',
      accentPrimary: '#0F5C5C',
      accentPrimaryHover: '#0B4848',
      accentSecondary: '#B87D3B',
      accentSecondarySoft: '#FBF3E8',
      accentSecondaryBorder: '#E9CEA8',
      bentoDarkBg: '#122626',
      bentoDarkInner: '#1A3333',
      semanticOlive: '#2E5E3E',
      semanticCrimson: '#B83227',
      heatmap: ['#E9F1F0', '#BCE0DD', '#6FB3AE', '#2E807D', '#0F5C5C'],
      chartGrid: '#E1ECEA',
      chartAxis: '#4B6161',
      chartPrimary: '#0F5C5C',
      chartSecondary: '#B87D3B',
      chartMuted: '#C3D7D4',
    },
    dark: {
      canvasBg: '#0D1414',
      surfaceCard: '#141E1E',
      surfaceSand: '#1B2828',
      surfaceDock: '#203030',
      borderHairline: '#273B3B',
      inkPrimary: '#ECF4F4',
      inkSecondary: '#94B0B0',
      accentPrimary: '#1D8A8A',
      accentPrimaryHover: '#24A1A1',
      accentSecondary: '#D99B52',
      accentSecondarySoft: '#292116',
      accentSecondaryBorder: '#574126',
      bentoDarkBg: '#101D1D',
      bentoDarkInner: '#182A2A',
      semanticOlive: '#5CB88A',
      semanticCrimson: '#E06B60',
      heatmap: ['#1B2828', '#1C4444', '#1E6868', '#2A908E', '#D99B52'],
      chartGrid: '#273B3B',
      chartAxis: '#94B0B0',
      chartPrimary: '#1D8A8A',
      chartSecondary: '#D99B52',
      chartMuted: '#314B4B',
    },
  },
  {
    id: 'graphite',
    name: 'Swiss Graphite & Burnt Amber',
    shortName: 'Graphite',
    tagline: 'Architectural Charcoal & Burnt Amber',
    swatchPrimary: '#1F1F23',
    swatchSecondary: '#C85A17',
    light: {
      canvasBg: '#F6F5F2',
      surfaceCard: '#FFFFFF',
      surfaceSand: '#ECEAE4',
      surfaceDock: '#E4E1DA',
      borderHairline: '#DDD9D0',
      inkPrimary: '#18181B',
      inkSecondary: '#575550',
      accentPrimary: '#1F1F23',
      accentPrimaryHover: '#111114',
      accentSecondary: '#C85A17',
      accentSecondarySoft: '#FDF1E8',
      accentSecondaryBorder: '#F0C7A8',
      bentoDarkBg: '#18181A',
      bentoDarkInner: '#242428',
      semanticOlive: '#2E5E3E',
      semanticCrimson: '#B83227',
      heatmap: ['#EAE8E2', '#F3CCB0', '#E29258', '#C85A17', '#1F1F23'],
      chartGrid: '#E5E2DA',
      chartAxis: '#575550',
      chartPrimary: '#1F1F23',
      chartSecondary: '#C85A17',
      chartMuted: '#CECAC1',
    },
    dark: {
      canvasBg: '#111113',
      surfaceCard: '#19191C',
      surfaceSand: '#222226',
      surfaceDock: '#27272C',
      borderHairline: '#303036',
      inkPrimary: '#F2F0EC',
      inkSecondary: '#A3A09A',
      accentPrimary: '#E0722A',
      accentPrimaryHover: '#EE833C',
      accentSecondary: '#F2F0EC',
      accentSecondarySoft: '#2A1E17',
      accentSecondaryBorder: '#5C3A24',
      bentoDarkBg: '#151518',
      bentoDarkInner: '#202025',
      semanticOlive: '#5CB88A',
      semanticCrimson: '#E06B60',
      heatmap: ['#222226', '#4E301D', '#874821', '#BC5F24', '#E0722A'],
      chartGrid: '#303036',
      chartAxis: '#A3A09A',
      chartPrimary: '#E0722A',
      chartSecondary: '#D6D2C9',
      chartMuted: '#42424A',
    },
  },
  {
    id: 'navy',
    name: 'Oxford Navy & Champagne Gold',
    shortName: 'Oxford',
    tagline: 'Academic Navy & Champagne Gold',
    swatchPrimary: '#1B2A4A',
    swatchSecondary: '#B88A2E',
    light: {
      canvasBg: '#F8F9FB',
      surfaceCard: '#FFFFFF',
      surfaceSand: '#EEF1F6',
      surfaceDock: '#E5EAF2',
      borderHairline: '#D8DFEB',
      inkPrimary: '#121926',
      inkSecondary: '#4E5B70',
      accentPrimary: '#1B2A4A',
      accentPrimaryHover: '#131F38',
      accentSecondary: '#B88A2E',
      accentSecondarySoft: '#FBF5E6',
      accentSecondaryBorder: '#EBD6A2',
      bentoDarkBg: '#111B30',
      bentoDarkInner: '#192744',
      semanticOlive: '#2E5E3E',
      semanticCrimson: '#B83227',
      heatmap: ['#EAEFF6', '#EEDB9E', '#CFA64C', '#566A94', '#1B2A4A'],
      chartGrid: '#E3E8F0',
      chartAxis: '#4E5B70',
      chartPrimary: '#1B2A4A',
      chartSecondary: '#B88A2E',
      chartMuted: '#C7D0DF',
    },
    dark: {
      canvasBg: '#0B101C',
      surfaceCard: '#121A2C',
      surfaceSand: '#19233A',
      surfaceDock: '#1E2A45',
      borderHairline: '#273554',
      inkPrimary: '#EFF2F8',
      inkSecondary: '#98A6BE',
      accentPrimary: '#35589A',
      accentPrimaryHover: '#456BB4',
      accentSecondary: '#E2B34B',
      accentSecondarySoft: '#282215',
      accentSecondaryBorder: '#5A4820',
      bentoDarkBg: '#0E1526',
      bentoDarkInner: '#162038',
      semanticOlive: '#5CB88A',
      semanticCrimson: '#E06B60',
      heatmap: ['#19233A', '#293B61', '#3B568C', '#9E7D31', '#E2B34B'],
      chartGrid: '#273554',
      chartAxis: '#98A6BE',
      chartPrimary: '#456BB4',
      chartSecondary: '#E2B34B',
      chartMuted: '#34456B',
    },
  },
  {
    id: 'olive',
    name: 'Warm Olive & Terracotta',
    shortName: 'Olive',
    tagline: 'Earthy Olive Grove & Fired Terracotta',
    swatchPrimary: '#4A5D23',
    swatchSecondary: '#C05638',
    light: {
      canvasBg: '#F9F7F2',
      surfaceCard: '#FFFFFF',
      surfaceSand: '#F1EFE5',
      surfaceDock: '#E8E5D8',
      borderHairline: '#DFDBC9',
      inkPrimary: '#1C1E15',
      inkSecondary: '#5B5E4E',
      accentPrimary: '#4A5D23',
      accentPrimaryHover: '#3A4A1B',
      accentSecondary: '#C05638',
      accentSecondarySoft: '#FCEEE9',
      accentSecondaryBorder: '#EDBEB0',
      bentoDarkBg: '#222619',
      bentoDarkInner: '#2C3121',
      semanticOlive: '#2E5E3E',
      semanticCrimson: '#B83227',
      heatmap: ['#ECEAD9', '#D6DFB3', '#A6BC6C', '#718A3B', '#4A5D23'],
      chartGrid: '#E8E5D7',
      chartAxis: '#5B5E4E',
      chartPrimary: '#4A5D23',
      chartSecondary: '#C05638',
      chartMuted: '#D2CEBC',
    },
    dark: {
      canvasBg: '#131510',
      surfaceCard: '#1B1E17',
      surfaceSand: '#23281E',
      surfaceDock: '#292E23',
      borderHairline: '#333A2B',
      inkPrimary: '#F3F2EA',
      inkSecondary: '#A8AC9B',
      accentPrimary: '#76933C',
      accentPrimaryHover: '#89A947',
      accentSecondary: '#DE7456',
      accentSecondarySoft: '#2D1E19',
      accentSecondaryBorder: '#63392C',
      bentoDarkBg: '#171A13',
      bentoDarkInner: '#21261B',
      semanticOlive: '#6EB583',
      semanticCrimson: '#E06B60',
      heatmap: ['#23281E', '#3A4723', '#566C2D', '#76933C', '#DE7456'],
      chartGrid: '#333A2B',
      chartAxis: '#A8AC9B',
      chartPrimary: '#76933C',
      chartSecondary: '#DE7456',
      chartMuted: '#464F3B',
    },
  },
] as const;

export const ACCENT_THEME_MAP: Record<AccentThemeId, CuratedAccentTheme> = ACCENT_THEMES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<AccentThemeId, CuratedAccentTheme>
);

export function normalizeAccentThemeId(raw: unknown): AccentThemeId {
  if (typeof raw === 'string' && (VALID_ACCENT_THEMES as readonly string[]).includes(raw)) {
    return raw as AccentThemeId;
  }
  return 'brown';
}

export function getActiveThemePalette(accent: AccentThemeId, isDark: boolean): ThemePaletteTokens {
  const theme = ACCENT_THEME_MAP[normalizeAccentThemeId(accent)];
  return isDark ? theme.dark : theme.light;
}

export function resolveEffectiveDarkMode(
  mode: ThemeMode | 'light' | 'dark',
  prefersDark: boolean
): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return prefersDark;
}

export function syncThemeBootStorage(mode: ThemeMode, accent: AccentThemeId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      THEME_BOOT_STORAGE_KEY,
      JSON.stringify({ mode, accent: normalizeAccentThemeId(accent) })
    );
  } catch {
    // ignore quota errors
  }
}

export function applyThemeToDocument(mode: ThemeMode, accent: AccentThemeId): boolean {
  if (typeof document === 'undefined') return mode === 'dark';
  const safeAccent = normalizeAccentThemeId(accent);
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = resolveEffectiveDarkMode(mode, prefersDark);

  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.setAttribute('data-accent', safeAccent);
  syncThemeBootStorage(mode, safeAccent);
  return isDark;
}
