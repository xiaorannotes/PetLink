// R-3 Keyboard Heatmap View: 104 / 87 / 75% layouts + customizable color palettes.
// Consumes aggregated per-key counts from R-1 SQLite daily_key_counts table (no sequence or text).

export const HEATMAP_PALETTES = Object.freeze({
  peach: { name: '蜜桃暖粉', low: '#FDE8EE', high: '#E04F70', textHigh: '#FFFFFF' },
  mint: { name: '薄荷森林', low: '#E2F6EE', high: '#2B8F6C', textHigh: '#FFFFFF' },
  amber: { name: '琥珀暖阳', low: '#FDF1D6', high: '#D97324', textHigh: '#FFFFFF' },
  ocean: { name: '晴空星海', low: '#E4EEFD', high: '#3A6BD9', textHigh: '#FFFFFF' }
});

const k = (id, label, u = 1, gap = 0) => ({ id, label, u, gap });

const MAIN_ROWS_STANDARD = [
  [k('ESC', 'Esc'), k('F1', 'F1', 1, 1), k('F2', 'F2'), k('F3', 'F3'), k('F4', 'F4'), k('F5', 'F5', 1, 0.5), k('F6', 'F6'), k('F7', 'F7'), k('F8', 'F8'), k('F9', 'F9', 1, 0.5), k('F10', 'F10'), k('F11', 'F11'), k('F12', 'F12')],
  [k('BACKQUOTE', '` ~'), k('1', '1'), k('2', '2'), k('3', '3'), k('4', '4'), k('5', '5'), k('6', '6'), k('7', '7'), k('8', '8'), k('9', '9'), k('0', '0'), k('MINUS', '-'), k('EQUAL', '='), k('BACKSPACE', 'Backspace', 2)],
  [k('TAB', 'Tab', 1.5), k('Q', 'Q'), k('W', 'W'), k('E', 'E'), k('R', 'R'), k('T', 'T'), k('Y', 'Y'), k('U', 'U'), k('I', 'I'), k('O', 'O'), k('P', 'P'), k('BRACKETLEFT', '['), k('BRACKETRIGHT', ']'), k('BACKSLASH', '\\', 1.5)],
  [k('CAPSLOCK', 'Caps', 1.75), k('A', 'A'), k('S', 'S'), k('D', 'D'), k('F', 'F'), k('G', 'G'), k('H', 'H'), k('J', 'J'), k('K', 'K'), k('L', 'L'), k('SEMICOLON', ';'), k('QUOTE', "'"), k('ENTER', 'Enter', 2.25)],
  [k('LSHIFT', 'Shift', 2.25), k('Z', 'Z'), k('X', 'X'), k('C', 'C'), k('V', 'V'), k('B', 'B'), k('N', 'N'), k('M', 'M'), k('COMMA', ','), k('PERIOD', '.'), k('SLASH', '/'), k('RSHIFT', 'Shift', 2.75)],
  [k('LCTRL', 'Ctrl', 1.25), k('LMETA', 'Win/⌘', 1.25), k('LALT', 'Alt', 1.25), k('SPACE', 'Space', 6.25), k('RALT', 'Alt', 1.25), k('RMETA', 'Fn/⌘', 1.25), k('MENU', 'Menu', 1.25), k('RCTRL', 'Ctrl', 1.25)]
];

const NAV_ROWS_STANDARD = [
  [k('PRTSC', 'PrtSc'), k('SCRLK', 'ScrLk'), k('PAUSE', 'Pause')],
  [k('INS', 'Ins'), k('HOME', 'Home'), k('PGUP', 'PgUp')],
  [k('DEL', 'Del'), k('END', 'End'), k('PGDN', 'PgDn')],
  [],
  [k('UP', '↑', 1, 1)],
  [k('LEFT', '←'), k('DOWN', '↓'), k('RIGHT', '→')]
];

const NUMPAD_ROWS_104 = [
  [],
  [k('NUMLOCK', 'Num'), k('NUM_DIV', '/'), k('NUM_MUL', '*'), k('NUM_SUB', '-')],
  [k('NUM_7', '7'), k('NUM_8', '8'), k('NUM_9', '9'), k('NUM_ADD', '+', 1)],
  [k('NUM_4', '4'), k('NUM_5', '5'), k('NUM_6', '6')],
  [k('NUM_1', '1'), k('NUM_2', '2'), k('NUM_3', '3'), k('NUM_ENTER', 'Ent', 1)],
  [k('NUM_0', '0', 2), k('NUM_DEC', '.')]
];

const COMPACT_75_ROWS = [
  [k('ESC', 'Esc'), k('F1', 'F1'), k('F2', 'F2'), k('F3', 'F3'), k('F4', 'F4'), k('F5', 'F5'), k('F6', 'F6'), k('F7', 'F7'), k('F8', 'F8'), k('F9', 'F9'), k('F10', 'F10'), k('F11', 'F11'), k('F12', 'F12'), k('PRTSC', 'PrtSc'), k('PAUSE', 'Pause'), k('DEL', 'Del')],
  [k('BACKQUOTE', '` ~'), k('1', '1'), k('2', '2'), k('3', '3'), k('4', '4'), k('5', '5'), k('6', '6'), k('7', '7'), k('8', '8'), k('9', '9'), k('0', '0'), k('MINUS', '-'), k('EQUAL', '='), k('BACKSPACE', 'Backspace', 2), k('HOME', 'Home')],
  [k('TAB', 'Tab', 1.5), k('Q', 'Q'), k('W', 'W'), k('E', 'E'), k('R', 'R'), k('T', 'T'), k('Y', 'Y'), k('U', 'U'), k('I', 'I'), k('O', 'O'), k('P', 'P'), k('BRACKETLEFT', '['), k('BRACKETRIGHT', ']'), k('BACKSLASH', '\\', 1.5), k('PGUP', 'PgUp')],
  [k('CAPSLOCK', 'Caps', 1.75), k('A', 'A'), k('S', 'S'), k('D', 'D'), k('F', 'F'), k('G', 'G'), k('H', 'H'), k('J', 'J'), k('K', 'K'), k('L', 'L'), k('SEMICOLON', ';'), k('QUOTE', "'"), k('ENTER', 'Enter', 2.25), k('PGDN', 'PgDn')],
  [k('LSHIFT', 'Shift', 2.25), k('Z', 'Z'), k('X', 'X'), k('C', 'C'), k('V', 'V'), k('B', 'B'), k('N', 'N'), k('M', 'M'), k('COMMA', ','), k('PERIOD', '.'), k('SLASH', '/'), k('RSHIFT', 'Shift', 1.75), k('UP', '↑'), k('END', 'End')],
  [k('LCTRL', 'Ctrl', 1.25), k('LMETA', '⌘', 1.25), k('LALT', 'Alt', 1.25), k('SPACE', 'Space', 6.25), k('RALT', 'Alt', 1), k('RMETA', 'Fn', 1), k('RCTRL', 'Ctrl', 1), k('LEFT', '←'), k('DOWN', '↓'), k('RIGHT', '→')]
];

export const KEYBOARD_LAYOUTS = Object.freeze({
  '104': {
    id: '104',
    name: '104 全尺寸配列',
    keyCount: 104,
    clusters: [
      { id: 'main', rows: MAIN_ROWS_STANDARD },
      { id: 'nav', rows: NAV_ROWS_STANDARD },
      { id: 'numpad', rows: NUMPAD_ROWS_104 }
    ]
  },
  '87': {
    id: '87',
    name: '87 竞技配列 (TKL)',
    keyCount: 87,
    clusters: [
      { id: 'main', rows: MAIN_ROWS_STANDARD },
      { id: 'nav', rows: NAV_ROWS_STANDARD }
    ]
  },
  '75%': {
    id: '75%',
    name: '75% 紧凑配列',
    keyCount: 84,
    clusters: [
      { id: 'compact75', rows: COMPACT_75_ROWS }
    ]
  }
});

export function parseHex(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [246, 168, 184];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

export function interpolateHexColor(lowHex, highHex, ratio) {
  const t = Math.max(0, Math.min(1, Number(ratio) || 0));
  const [r1, g1, b1] = parseHex(lowHex);
  const [r2, g2, b2] = parseHex(highHex);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

export function computeKeyColor(count, maxCount, { low = '#FDE8EE', high = '#E04F70' } = {}) {
  const c = Number(count) || 0;
  const m = Math.max(1, Number(maxCount) || 1);
  if (c <= 0) return { bg: 'var(--card, #FFFDF8)', fg: 'var(--text, #5C4A3A)', ratio: 0 };
  const ratio = Math.pow(Math.min(1, c / m), 0.72);
  const bg = interpolateHexColor(low, high, ratio);
  const fg = ratio > 0.42 ? '#FFFFFF' : 'var(--text, #5C4A3A)';
  return { bg, fg, ratio };
}

export function countLayoutKeys(layoutId) {
  const layout = KEYBOARD_LAYOUTS[layoutId];
  if (!layout) return 0;
  return layout.clusters.reduce(
    (sum, cluster) => sum + cluster.rows.reduce((rSum, row) => rSum + row.length, 0),
    0
  );
}

const ACTIVITY_LABELS = {
  active: '活跃打字中',
  idle: '短暂空闲',
  away: '离开休息 (≥5分钟)'
};

export function renderHeatmapView(container, snapshot, call) {
  if (!container) return;
  const activity = snapshot?.activityStats || {
    day: new Date().toLocaleDateString('en-CA'),
    totals: { keystrokes: snapshot?.typing?.today || 0, clicks: 0, wheelSteps: 0 },
    keyCounts: {},
    activity: { state: 'idle', idleSeconds: 0 },
    privacy: { ok: true }
  };
  const settings = snapshot?.settings || {};
  const layoutId = KEYBOARD_LAYOUTS[settings.heatmapLayout] ? settings.heatmapLayout : '104';
  const paletteId = settings.heatmapPalette || 'peach';
  const preset = HEATMAP_PALETTES[paletteId] || HEATMAP_PALETTES.peach;
  const lowColor = paletteId === 'custom' && settings.heatmapCustomLow ? settings.heatmapCustomLow : preset.low;
  const highColor = paletteId === 'custom' && settings.heatmapCustomHigh ? settings.heatmapCustomHigh : preset.high;

  const keyCounts = activity.keyCounts || {};
  const maxCount = Math.max(1, ...Object.values(keyCounts).map(Number));

  // Top 5 keys
  const topKeys = Object.entries(keyCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);

  container.replaceChildren();

  // 1. Summary Metrics Bar
  const summaryGrid = document.createElement('div');
  summaryGrid.className = 'heatmap-summary-grid';
  for (const [label, value, sub] of [
    ['今日键盘敲击', `${activity.totals?.keystrokes || 0} 次`, `覆盖 ${Object.keys(keyCounts).length} 个按键`],
    ['今日鼠标点击', `${activity.totals?.clicks || 0} 次`, '左/中/右键累计'],
    ['今日滚轮滑动', `${activity.totals?.wheelSteps || 0} 格`, `约 ${((activity.totals?.wheelSteps || 0) * 0.025).toFixed(2)} 米`],
    ['人的活动信号', ACTIVITY_LABELS[activity.activity?.state] || '短暂空闲', `闲置 ${Math.floor(activity.activity?.idleSeconds || 0)} 秒`]
  ]) {
    const card = document.createElement('article');
    card.className = 'heatmap-stat-card';
    const s = document.createElement('small');
    s.textContent = label;
    const v = document.createElement('strong');
    v.textContent = value;
    const hint = document.createElement('span');
    hint.textContent = sub;
    card.append(s, v, hint);
    summaryGrid.append(card);
  }
  container.append(summaryGrid);

  // 2. Toolbar: Layout Switcher (104 / 87 / 75%) + Palette & Custom Color Picker
  const toolbar = document.createElement('article');
  toolbar.className = 'heatmap-toolbar';

  const layoutGroup = document.createElement('div');
  layoutGroup.className = 'heatmap-control-group';
  const layoutLabel = document.createElement('span');
  layoutLabel.className = 'group-title';
  layoutLabel.textContent = '键盘配列';
  layoutGroup.append(layoutLabel);

  for (const id of ['104', '87', '75%']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.layout = id;
    btn.setAttribute('aria-pressed', String(layoutId === id));
    btn.textContent = `${id} (${KEYBOARD_LAYOUTS[id].keyCount}键)`;
    btn.onclick = () => call('settings', { heatmapLayout: id });
    layoutGroup.append(btn);
  }

  const paletteGroup = document.createElement('div');
  paletteGroup.className = 'heatmap-control-group';
  const paletteLabel = document.createElement('span');
  paletteLabel.className = 'group-title';
  paletteLabel.textContent = '热力配色';
  paletteGroup.append(paletteLabel);

  for (const [id, p] of Object.entries(HEATMAP_PALETTES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.palette = id;
    btn.setAttribute('aria-pressed', String(paletteId === id));
    const swatch = document.createElement('i');
    swatch.className = 'palette-swatch';
    swatch.style.background = `linear-gradient(135deg, ${p.low}, ${p.high})`;
    btn.append(swatch, document.createTextNode(p.name));
    btn.onclick = () => call('settings', { heatmapPalette: id });
    paletteGroup.append(btn);
  }

  // Custom color pickers
  const lowInput = document.createElement('input');
  lowInput.type = 'color';
  lowInput.id = 'heatmap-custom-low';
  lowInput.title = '自定义低频色';
  lowInput.value = lowColor;
  const highInput = document.createElement('input');
  highInput.type = 'color';
  highInput.id = 'heatmap-custom-high';
  highInput.title = '自定义高频色';
  highInput.value = highColor;
  const applyCustom = () => call('settings', {
    heatmapPalette: 'custom',
    heatmapCustomLow: lowInput.value,
    heatmapCustomHigh: highInput.value
  });
  lowInput.onchange = applyCustom;
  highInput.onchange = applyCustom;

  const customWrap = document.createElement('span');
  customWrap.className = 'custom-color-wrap';
  customWrap.append(document.createTextNode('自定义'), lowInput, document.createTextNode('→'), highInput);
  paletteGroup.append(customWrap);

  toolbar.append(layoutGroup, paletteGroup);
  container.append(toolbar);

  // 3. Keyboard Board Rendering
  const boardWrap = document.createElement('article');
  boardWrap.className = `keyboard-board layout-${layoutId.replace('%', 'pct')}`;
  boardWrap.dataset.activeLayout = layoutId;

  const boardHeader = document.createElement('div');
  boardHeader.className = 'keyboard-board-header';
  const boardTitle = document.createElement('strong');
  boardTitle.textContent = `${KEYBOARD_LAYOUTS[layoutId].name} · 当日按键热力分布 (${activity.day})`;
  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  legend.append(document.createTextNode('0 次'));
  for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
    const dot = document.createElement('span');
    dot.className = 'legend-step';
    dot.style.background = ratio === 0 ? 'var(--card, #FFFDF8)' : interpolateHexColor(lowColor, highColor, ratio);
    legend.append(dot);
  }
  legend.append(document.createTextNode(`最高 (${maxCount === 1 && !topKeys.length ? 0 : maxCount} 次)`));
  boardHeader.append(boardTitle, legend);
  boardWrap.append(boardHeader);

  const clustersRow = document.createElement('div');
  clustersRow.className = 'keyboard-clusters';

  for (const cluster of KEYBOARD_LAYOUTS[layoutId].clusters) {
    const clusterEl = document.createElement('div');
    clusterEl.className = `kb-cluster kb-cluster-${cluster.id}`;
    for (const row of cluster.rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      if (!row.length) {
        rowEl.classList.add('kb-row-spacer');
      }
      for (const keyDef of row) {
        if (keyDef.gap) {
          const spacer = document.createElement('div');
          spacer.className = 'kb-gap';
          spacer.style.setProperty('--u', String(keyDef.gap));
          rowEl.append(spacer);
        }
        const count = Number(keyCounts[keyDef.id] || 0);
        const { bg, fg } = computeKeyColor(count, maxCount, { low: lowColor, high: highColor });
        const keyEl = document.createElement('div');
        keyEl.className = 'kb-key' + (count > 0 ? ' active' : '');
        keyEl.dataset.keyId = keyDef.id;
        keyEl.dataset.count = String(count);
        keyEl.style.setProperty('--u', String(keyDef.u || 1));
        keyEl.style.background = bg;
        keyEl.style.color = fg;
        keyEl.title = `${keyDef.label} (${keyDef.id})：今日敲击 ${count} 次`;

        const capLabel = document.createElement('span');
        capLabel.className = 'kb-label';
        capLabel.textContent = keyDef.label;

        const capCount = document.createElement('small');
        capCount.className = 'kb-count';
        capCount.textContent = count > 0 ? String(count) : '';

        keyEl.append(capLabel, capCount);
        rowEl.append(keyEl);
      }
      clusterEl.append(rowEl);
    }
    clustersRow.append(clusterEl);
  }
  boardWrap.append(clustersRow);

  // 4. Footer: Top keys + Privacy Proof Badge
  const footer = document.createElement('div');
  footer.className = 'keyboard-board-footer';
  const topWrap = document.createElement('div');
  topWrap.className = 'top-keys-list';
  topWrap.textContent = topKeys.length
    ? '今日高频按键 Top 5：' + topKeys.map(([id, cnt]) => `${id} (${cnt}次)`).join(' · ')
    : '今日尚无按键分布记录，开始敲击键盘即可实时点亮热力图';

  const privacyBadge = document.createElement('span');
  privacyBadge.className = 'privacy-proof-badge';
  privacyBadge.textContent = activity.privacy?.ok
    ? '🔒 隐私结构自证通过：SQLite WITHOUT ROWID · 仅聚合频次 · 零输入内容/零按键顺序'
    : '🔒 仅本机统计';

  footer.append(topWrap, privacyBadge);
  boardWrap.append(footer);
  container.append(boardWrap);
}
