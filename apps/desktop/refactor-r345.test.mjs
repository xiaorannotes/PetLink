import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYBOARD_LAYOUTS, countLayoutKeys, computeKeyColor, HEATMAP_PALETTES } from './heatmap-view.mjs';
import { buildReportSummary, formatDurationChinese } from './report-card.mjs';
import { THEMES, THEME_IDS, getTheme, applyThemeToDocument } from './themes.mjs';

test('R-3 keyboard heatmap supports 104, 87, and 75% layouts and customizable color palettes', () => {
  assert.equal(countLayoutKeys('104'), 104);
  assert.equal(countLayoutKeys('87'), 87);
  assert.equal(countLayoutKeys('75%'), 84);
  assert.ok(Object.keys(HEATMAP_PALETTES).length >= 4);

  const zero = computeKeyColor(0, 100, { low: '#FDE8EE', high: '#E04F70' });
  assert.equal(zero.ratio, 0);

  const full = computeKeyColor(100, 100, { low: '#000000', high: '#FF0000' });
  assert.equal(full.bg, '#ff0000');
  assert.equal(full.fg, '#FFFFFF');
});

test('R-4 daily report summary matches daily statistics, fun conversions, hourly rhythm, and AI summary', () => {
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    keystrokes: hour === 15 ? 100 : 0,
    clicks: hour === 15 ? 50 : 0,
    wheelSteps: hour === 15 ? 40 : 0
  }));
  const snapshot = {
    character: { manifest: { name: '肖大大' } },
    settings: { theme: 'mint' },
    sessions: [{ source: 'claude-code', session: 's1', state: 'working' }],
    companion: { todayCompanionship: 2, balance: 15, hunger: 88, todayDone: 4 },
    activityStats: {
      day: '2026-11-23',
      totals: { keystrokes: 100, clicks: 50, wheelSteps: 40 },
      hourly,
      keyCounts: { E: 35, SPACE: 25, ENTER: 15, A: 10 },
      aiStats: { workingSeconds: 3725, doneCount: 4 }
    }
  };

  const summary = buildReportSummary(snapshot);
  assert.equal(summary.day, '2026-11-23');
  assert.equal(summary.totals.keystrokes, 100);
  assert.equal(summary.totals.clicks, 50);
  assert.equal(summary.totals.wheelSteps, 40);
  assert.equal(summary.funFacts.peakPeriod, '15:00 - 16:00');
  assert.ok(summary.funFacts.fingerTravelMeters > 0);
  assert.ok(summary.funFacts.scrollTravelMeters > 0);
  assert.equal(summary.ai.workingSeconds, 3725);
  assert.equal(summary.ai.workingFormatted, '1 小时 2 分');
  assert.equal(summary.ai.doneCount, 4);
  assert.equal(summary.companion.todayCompanionship, 2);
  assert.equal(summary.companion.topKeys[0].key, 'E');
  assert.equal(formatDurationChinese(125), '2 分 5 秒');
});

test('R-5 theme/skin mechanism provides 3 switchable skins and applies CSS variables', () => {
  assert.ok(THEME_IDS.length >= 3);
  assert.deepEqual(THEME_IDS, ['peach', 'mint', 'lavender']);
  for (const id of THEME_IDS) {
    const t = getTheme(id);
    assert.ok(t.bg && t.card && t.brand && t.border);
  }
  const vars = {};
  const mockDoc = {
    documentElement: {
      dataset: {},
      style: { setProperty: (k, v) => { vars[k] = v; } }
    }
  };
  applyThemeToDocument(mockDoc, 'mint');
  assert.equal(mockDoc.documentElement.dataset.theme, 'mint');
  assert.equal(vars['--bg'], THEMES.mint.bg);
  assert.equal(vars['--brand'], THEMES.mint.brand);
  assert.equal(vars['--card'], THEMES.mint.card);
});
