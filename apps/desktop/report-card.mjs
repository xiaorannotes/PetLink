// R-4 Daily Report Card Generator: computes daily statistics, original fun conversions,
// 24-hour rhythm curve, AI work duration/completions, and companion summary,
// and renders a shareable UI2-styled vertical long-image card onto Canvas (exportable to PNG).
// Strictly local file generation; no social platform upload features built in.

import { getTheme } from './themes.mjs';

export function formatDurationChinese(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${secs} 秒`;
  return `${secs} 秒`;
}

export function buildReportSummary(snapshot) {
  const activity = snapshot?.activityStats || {};
  const day = activity.day || new Date().toLocaleDateString('en-CA');
  const keystrokes = Number(activity.totals?.keystrokes ?? snapshot?.typing?.today ?? 0);
  const clicks = Number(activity.totals?.clicks ?? 0);
  const wheelSteps = Number(activity.totals?.wheelSteps ?? 0);

  // Original fun physical conversions (clean-room original expressions)
  // 3.8mm key travel per keystroke, 24mm scroll travel per wheel notch, 1.8mm click travel
  const fingerTravelMeters = Number(((keystrokes * 3.8 + clicks * 1.8) / 1000).toFixed(2));
  const scrollTravelMeters = Number(((wheelSteps * 24) / 1000).toFixed(2));
  const calorieSpark = Number(((keystrokes * 0.0012) + (clicks * 0.0008)).toFixed(2));

  const hourly = Array.isArray(activity.hourly) && activity.hourly.length === 24
    ? activity.hourly
    : Array.from({ length: 24 }, (_, hour) => ({ hour, keystrokes: 0, clicks: 0, wheelSteps: 0 }));

  let peakHour = null;
  let peakScore = 0;
  for (const h of hourly) {
    const score = (Number(h.keystrokes) || 0) + (Number(h.clicks) || 0) + (Number(h.wheelSteps) || 0);
    if (score > peakScore) {
      peakScore = score;
      peakHour = h.hour;
    }
  }
  const peakPeriod = peakHour === null
    ? '今日节奏平稳'
    : `${String(peakHour).padStart(2, '0')}:00 - ${String((peakHour + 1) % 24).padStart(2, '0')}:00`;

  const companion = snapshot?.companion || {};
  const aiWorkingSeconds = Number(activity.aiStats?.workingSeconds || 0);
  const aiDoneCount = Math.max(
    Number(companion.todayDone || 0),
    Number(activity.aiStats?.doneCount || 0)
  );

  const keyCounts = activity.keyCounts || {};
  const topKeys = Object.entries(keyCounts)
    .filter(([, cnt]) => cnt > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([key, count]) => ({ key, count }));

  return {
    day,
    characterName: snapshot?.character?.manifest?.name || '肖大大',
    themeId: snapshot?.settings?.theme || 'lavender',
    totals: {
      keystrokes,
      clicks,
      wheelSteps
    },
    funFacts: {
      fingerTravelMeters,
      scrollTravelMeters,
      calorieSpark,
      peakPeriod,
      fingerLine: `指尖在键帽间轻快跃动 ${fingerTravelMeters} 米，释放 ${calorieSpark} 千卡专注花火`,
      scrollLine: `滚轮漫游代码与文档长卷 ${scrollTravelMeters} 米，灵感高峰在 ${peakPeriod}`
    },
    hourly,
    ai: {
      workingSeconds: aiWorkingSeconds,
      workingFormatted: formatDurationChinese(aiWorkingSeconds),
      doneCount: aiDoneCount,
      activeSessions: (snapshot?.sessions || []).length
    },
    companion: {
      todayCompanionship: Number(companion.todayCompanionship || 0),
      balance: Number(companion.balance || 0),
      hunger: Math.floor(Number(companion.hunger ?? 80)),
      topKeys
    }
  };
}

function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

export function drawReportCardCanvas(canvas, summary, avatarImage = null) {
  if (!canvas) return;
  const theme = getTheme(summary.themeId);
  const dpr = 2;
  const W = 720;
  const H = 1080;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = '100%';
  canvas.style.maxWidth = '560px';
  canvas.style.height = 'auto';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // 1. Background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  // Decorative soft radial glow at top right
  const grad = ctx.createRadialGradient(W - 90, 90, 20, W - 90, 90, 320);
  grad.addColorStop(0, theme.softBg);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 400);

  // 2. Header Card
  drawRoundedRect(ctx, 32, 28, W - 64, 128, 26, theme.card, theme.border);
  drawRoundedRect(ctx, 52, 46, 92, 92, 46, theme.accentBg, theme.border);
  if (avatarImage && avatarImage.complete && avatarImage.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(98, 92, 44, 0, Math.PI * 2);
    ctx.clip();
    const nw = avatarImage.naturalWidth;
    const nh = avatarImage.naturalHeight;
    let sx = 0, sy = 0, sw = nw, sh = nh;
    try {
      const tmp = document.createElement('canvas');
      tmp.width = nw; tmp.height = nh;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(avatarImage, 0, 0);
      const px = tctx.getImageData(0, 0, nw, nh).data;
      let minX = nw, minY = nh, maxX = 0, maxY = 0;
      for (let y = 0; y < nh; y += 2) {
        for (let x = 0; x < nw; x += 2) {
          if (px[(y * nw + x) * 4 + 3] > 20) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX > minX && maxY > minY) {
        sx = Math.max(0, minX - 4);
        sy = Math.max(0, minY - 4);
        sw = Math.min(nw - sx, maxX - minX + 8);
        sh = Math.min(nh - sy, maxY - minY + 8);
      }
    } catch {}
    const box = 82;
    const ratio = Math.min(box / sw, box / sh);
    const dw = sw * ratio;
    const dh = sh * ratio;
    ctx.drawImage(avatarImage, sx, sy, sw, sh, 98 - dw / 2, 92 - dh / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = theme.brand;
    ctx.font = 'bold 30px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐾', 98, 103);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 26px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('PetLink · 今日陪伴日报', 164, 76);

  ctx.fillStyle = theme.muted;
  ctx.font = '14px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(`伙伴：${summary.characterName}  ·  专注与陪伴记录（仅本机生成）`, 164, 105);

  // Date badge
  drawRoundedRect(ctx, W - 188, 52, 134, 36, 18, theme.brandLight, null);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(summary.day, W - 121, 75);

  // 3. Three Core Key/Mouse Metric Cards
  const cardW = (W - 64 - 28) / 3;
  const metrics = [
    ['今日键盘敲击', `${summary.totals.keystrokes}`, '次敲击', theme.card],
    ['今日鼠标点击', `${summary.totals.clicks}`, '次点击', theme.accentBg],
    ['今日滚轮滑动', `${summary.totals.wheelSteps}`, '格滚动', theme.softBg]
  ];
  metrics.forEach(([title, num, unit, bg], idx) => {
    const x = 32 + idx * (cardW + 14);
    const y = 176;
    drawRoundedRect(ctx, x, y, cardW, 118, 22, bg, theme.border);
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.muted;
    ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(title, x + 20, y + 32);

    ctx.fillStyle = theme.text;
    ctx.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(num, x + 20, y + 76);

    ctx.fillStyle = theme.muted;
    ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(unit, x + 20, y + 100);
  });

  // 4. Fun Conversions Banner
  drawRoundedRect(ctx, 32, 312, W - 64, 108, 22, theme.card, theme.border);
  drawRoundedRect(ctx, 50, 330, 6, 72, 3, theme.brand, null);
  ctx.textAlign = 'left';
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('✨ 今日趣味换算', 70, 346);
  ctx.fillStyle = theme.text;
  ctx.font = '14px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(`• ${summary.funFacts.fingerLine}`, 70, 374);
  ctx.fillText(`• ${summary.funFacts.scrollLine}`, 70, 400);

  // 5. 24-Hour Rhythm Curve Card
  drawRoundedRect(ctx, 32, 438, W - 64, 260, 24, theme.card, theme.border);
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 17px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('📈 24 小时键鼠活跃节奏曲线', 54, 474);
  ctx.fillStyle = theme.muted;
  ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(`活跃峰值时段：${summary.funFacts.peakPeriod}（柱：键盘敲击 · 线：键鼠总活跃）`, 290, 474);

  const chartX = 60;
  const chartY = 500;
  const chartW = W - 120;
  const chartH = 148;
  const maxHourVal = Math.max(
    10,
    ...summary.hourly.map(h => (Number(h.keystrokes) || 0) + (Number(h.clicks) || 0) + (Number(h.wheelSteps) || 0))
  );

  // Horizontal grid lines
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const gy = chartY + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(chartX, gy);
    ctx.lineTo(chartX + chartW, gy);
    ctx.stroke();
  }

  const stepW = chartW / 24;
  const curvePoints = [];
  summary.hourly.forEach((h, idx) => {
    const kx = chartX + idx * stepW + stepW * 0.2;
    const bw = stepW * 0.6;
    const kVal = Number(h.keystrokes) || 0;
    const totalVal = kVal + (Number(h.clicks) || 0) + (Number(h.wheelSteps) || 0);
    const barH = Math.max(2, (kVal / maxHourVal) * chartH);
    const by = chartY + chartH - barH;

    drawRoundedRect(ctx, kx, by, bw, barH, 4, theme.brandLight, null);
    curvePoints.push({
      x: chartX + idx * stepW + stepW * 0.5,
      y: chartY + chartH - (totalVal / maxHourVal) * chartH
    });

    if (idx % 3 === 0 || idx === 23) {
      ctx.fillStyle = theme.muted;
      ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${String(idx).padStart(2, '0')}:00`, chartX + idx * stepW + stepW * 0.5, chartY + chartH + 22);
    }
  });

  // Rhythm curve line
  ctx.beginPath();
  curvePoints.forEach((pt, idx) => {
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.strokeStyle = theme.brand;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  curvePoints.forEach(pt => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = theme.brand;
    ctx.fill();
  });

  // 6. AI Collaboration & Pet Companionship Dual Cards
  const halfW = (W - 64 - 16) / 2;
  drawRoundedRect(ctx, 32, 716, halfW, 196, 24, theme.card, theme.border);
  drawRoundedRect(ctx, 32 + halfW + 16, 716, halfW, 196, 24, theme.card, theme.border);

  ctx.textAlign = 'left';
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 17px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('🤖 AI 协同工作统计', 54, 752);
  ctx.fillStyle = theme.muted;
  ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('今日 AI 协同工作时长', 54, 784);
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 26px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(summary.ai.workingFormatted, 54, 818);

  ctx.fillStyle = theme.muted;
  ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(`今日完成任务：${summary.ai.doneCount} 次  ·  活跃会话：${summary.ai.activeSessions} 个`, 54, 856);
  ctx.fillText('信号优先级：AI 状态事件 > 键鼠活跃 > 日常陪伴', 54, 884);

  const rx = 32 + halfW + 16 + 22;
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 17px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('🍑 桌宠陪伴摘要', rx, 752);
  ctx.fillStyle = theme.muted;
  ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(`今日陪伴分：+${summary.companion.todayCompanionship} 分  ·  当前积分：${summary.companion.balance} 分`, rx, 788);
  ctx.fillText(`当前饱食度：${summary.companion.hunger} / 100`, rx, 818);

  const topKeyText = summary.companion.topKeys.length
    ? summary.companion.topKeys.map(t => `${t.key}(${t.count})`).join(' / ')
    : '等待今日首次击键';
  ctx.fillText(`高频按键徽章：${topKeyText}`, rx, 850);
  ctx.fillStyle = theme.brand;
  ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(`「${summary.characterName}今天也一直陪着你哟！」`, rx, 884);

  // 7. Footer Banner
  drawRoundedRect(ctx, 32, 930, W - 64, 116, 22, theme.accentBg, theme.border);
  ctx.fillStyle = theme.accentText;
  ctx.font = 'bold 15px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('🔒 隐私承诺与洁净本地统计', 54, 964);
  ctx.fillStyle = theme.text;
  ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('• 仅统计敲击、点击与滚轮次数及按小时聚合，绝不记录输入内容或按键先后顺序。', 54, 992);
  ctx.fillText('• 全部数据保存在本机 SQLite (WITHOUT ROWID)，无云端上传、无账号注册、无社交内置上传。', 54, 1018);
}

export function renderReportView(container, snapshot, call) {
  if (!container) return;
  const summary = buildReportSummary(snapshot);
  container.replaceChildren();

  const actionsBar = document.createElement('article');
  actionsBar.className = 'report-actions-bar';

  const info = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = `${summary.day} 陪伴日报长图`;
  const desc = document.createElement('p');
  desc.textContent = `今日敲击 ${summary.totals.keystrokes} 次 · 点击 ${summary.totals.clicks} 次 · 滚轮 ${summary.totals.wheelSteps} 格 · AI 工作 ${summary.ai.workingFormatted}（完成 ${summary.ai.doneCount} 次）`;
  info.append(title, desc);

  const btnGroup = document.createElement('div');
  btnGroup.className = 'report-btn-group';

  const canvas = document.createElement('canvas');
  canvas.id = 'report-canvas';

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.id = 'report-refresh-btn';
  refreshBtn.textContent = '刷新日报数据';
  refreshBtn.onclick = () => call('snapshot');

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.id = 'report-save-btn';
  saveBtn.className = 'primary-btn';
  saveBtn.textContent = '保存日报长图 (PNG)';
  const statusEl = document.createElement('p');
  statusEl.id = 'report-save-status';
  statusEl.className = 'report-save-status';

  saveBtn.onclick = async () => {
    const dataUrl = canvas.toDataURL('image/png');
    const res = await call('save-report-card', {
      dataUrl,
      defaultName: `PetLink-日报卡片-${summary.day}.png`
    });
    if (res?.ok && res.filePath) {
      statusEl.textContent = `✓ 已保存日报长图至：${res.filePath}`;
    } else if (res?.canceled) {
      statusEl.textContent = '已取消保存';
    }
  };

  btnGroup.append(refreshBtn, saveBtn);
  actionsBar.append(info, btnGroup);

  const previewCard = document.createElement('article');
  previewCard.className = 'report-preview-card';
  previewCard.append(statusEl, canvas);

  container.append(actionsBar, previewCard);

  const avatarImg = document.getElementById('brand-avatar');
  drawReportCardCanvas(canvas, summary, avatarImg);
}
