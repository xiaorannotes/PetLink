// R-5 Theme/Skin system: extracts UI2 base/accent/card variables and provides 3 built-in switchable skins.

export const THEMES = Object.freeze({
  peach: {
    id: 'peach',
    name: '蜜桃米白',
    bg: '#FBF6EC',
    card: '#FFFDF8',
    brand: '#F28CA0',
    brandLight: '#F6A8B8',
    border: '#F0E4CE',
    text: '#5C4A3A',
    muted: '#9A8874',
    accentBg: '#FCEBC8',
    accentText: '#8A6420',
    softBg: '#FBE3E6'
  },
  mint: {
    id: 'mint',
    name: '薄荷奶绿',
    bg: '#F2F9F5',
    card: '#FAFFFC',
    brand: '#52AD8E',
    brandLight: '#79CBB0',
    border: '#D5ECE2',
    text: '#2D4A3E',
    muted: '#69887B',
    accentBg: '#DDF3E8',
    accentText: '#2A6B53',
    softBg: '#E5F6EE'
  },
  lavender: {
    id: 'lavender',
    name: '芋泥星夜（默认）',
    bg: '#F5F2FA',
    card: '#FDFBFF',
    brand: '#8E74D1',
    brandLight: '#B29CE8',
    border: '#E0D8F0',
    text: '#3E3456',
    muted: '#7C7096',
    accentBg: '#EAE3F8',
    accentText: '#574191',
    softBg: '#EFEAFB'
  }
});

export const THEME_IDS = Object.freeze(Object.keys(THEMES));

export function getTheme(themeId) {
  return THEMES[themeId] || THEMES.lavender;
}

export function applyThemeToDocument(doc, themeId) {
  if (!doc?.documentElement) return;
  const theme = getTheme(themeId);
  const root = doc.documentElement;
  root.dataset.theme = theme.id;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--card', theme.card);
  root.style.setProperty('--brand', theme.brand);
  root.style.setProperty('--brand-light', theme.brandLight);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--muted', theme.muted);
  root.style.setProperty('--accent-bg', theme.accentBg);
  root.style.setProperty('--accent-text', theme.accentText);
  root.style.setProperty('--soft-bg', theme.softBg);
}
