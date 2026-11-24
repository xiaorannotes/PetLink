import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.resolve(root, '../../outputs/posters');
const docsDir = path.join(root, 'docs/posters');
const appBinary = path.join(root, 'dist/m6-mac/PetLink-Mac/PetLink.app/Contents/MacOS/Electron');
const dafeiyuFrames = pathToFileURL(path.join(root, 'characters/dafeiyu/frames/')).href;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targets(port) { return fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()); }
async function connect(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); } };
  const send = async (method, params = {}) => {
    const key = ++id;
    const p = new Promise(r => pending.set(key, r));
    ws.send(JSON.stringify({ id: key, method, params }));
    const m = await p;
    if (m.error) throw Error(JSON.stringify(m.error));
    return m.result;
  };
  return {
    send,
    close: () => ws.close(),
    capture: async (file, clip) => {
      const res = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : { captureBeyondViewport: false }) });
      await writeFile(file, Buffer.from(res.data, 'base64'));
    },
    eval: async expression => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    }
  };
}

await rm(outDir, { recursive: true, force: true });
await rm(docsDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await mkdir(docsDir, { recursive: true });

const base = await mkdtemp('/tmp/petlink-posters9-');
const shotsDir = path.join(base, 'shots');
await mkdir(shotsDir, { recursive: true });

const child = spawn(appBinary, [
  '--user-data-dir=' + base + '/electron',
  '--inspect=9395',
  '--remote-debugging-port=9394',
  path.join(root, 'dist/m6-mac/PetLink-Mac/PetLink.app/Contents/Resources/app')
], {
  env: { ...process.env, PETLINK_DATA_DIR: base },
  stdio: 'ignore',
  detached: true
});

const clients = [];
try {
  let ts;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      ts = await targets(9394);
      if (ts.some(t => t.url.endsWith('control.html'))) break;
    } catch {}
  }
  const control = await connect(ts.find(t => t.url.endsWith('control.html'))); clients.push(control);
  const main = await connect((await targets(9395))[0]); clients.push(main);

  await sleep(600);
  await control.eval(`document.getElementById('skip')?.click()`);
  await control.eval(`window.petlink.call('settings',{character:'dafeiyu',theme:'lavender',onboarded:true,heatmapPalette:'twilight'})`);
  await sleep(1200);

  // Seed rich activity data
  const hourlySeed = [
    [9, 340, 88, 65], [10, 560, 128, 92], [11, 490, 115, 78], [13, 280, 70, 50],
    [14, 650, 168, 118], [15, 740, 192, 138], [16, 520, 135, 90], [17, 310, 92, 55]
  ];
  const keySeed = {
    E: 430, SPACE: 410, A: 295, S: 255, D: 245, F: 205, J: 190, K: 185, L: 170, ENTER: 325,
    BACKSPACE: 200, T: 220, I: 230, O: 195, N: 215, R: 225, C: 180, V: 160, LSHIFT: 175,
    LCTRL: 145, LMETA: 165, TAB: 135, W: 155, Q: 100, P: 115, M: 130, B: 95, G: 110, H: 120,
    U: 140, Y: 105, Z: 80, X: 90, COMMA: 100, PERIOD: 110, SLASH: 85, 1: 70, 2: 75, 3: 65, ESC: 90
  };
  for (const [hour, k, c, w] of hourlySeed) {
    await control.eval(`window.petlink.call('activity-record',${JSON.stringify({ hour, keystrokes: k, clicks: c, wheelSteps: w })})`);
  }
  await control.eval(`window.petlink.call('activity-record',${JSON.stringify({
    keystrokes: 0, clicks: 0, wheelSteps: 0, keys: keySeed, aiWorkingSeconds: 9120, aiDoneCount: 15
  })})`);
  await sleep(300);

  // Resize control window for crisp screenshots
  await main.eval(`(() => {
    const { BrowserWindow } = process.mainModule.require('electron');
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('control.html'));
    if (win) { win.setSize(1120, 760); win.center(); }
  })()`);
  await sleep(300);

  const shotMap = {};
  const captureTab = async (tabId, name) => {
    await control.eval(`document.querySelector('[data-page="${tabId}"]')?.click()`);
    await sleep(600);
    const file = path.join(shotsDir, `${name}.png`);
    await control.capture(file);
    shotMap[name] = pathToFileURL(file).href;
  };

  await captureTab('connections', 'connections');
  await captureTab('heatmap', 'heatmap');
  await captureTab('report', 'report');
  await captureTab('companion', 'companion');
  await captureTab('pets', 'pets');
  await captureTab('actions', 'actions');

  const commonCss = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1200px; height: 675px; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: radial-gradient(circle at 12% 14%, #FFFFFF 0%, #F5F2FA 42%, #EAE3F8 100%);
      color: #3E3456; position: relative;
    }
    .blob { position: absolute; border-radius: 999px; filter: blur(48px); opacity: .55; pointer-events: none; }
    .b1 { width: 420px; height: 420px; background: #D7C8F6; top: -140px; right: -90px; }
    .b2 { width: 340px; height: 340px; background: #E3D6FA; bottom: -120px; left: -80px; }
    .b3 { width: 220px; height: 220px; background: #C8B5F0; top: 240px; left: 460px; opacity: .28; }
    .wrap {
      position: relative; z-index: 2; width: 100%; height: 100%;
      padding: 40px 52px 34px; display: flex; flex-direction: column; justify-content: space-between;
    }
    .topbar { display: flex; align-items: center; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 18px; color: #574191; }
    .brand-dot { width: 12px; height: 12px; border-radius: 50%; background: linear-gradient(135deg, #8E74D1, #B29CE8); box-shadow: 0 0 0 4px rgba(142,116,209,.18); }
    .gh-pill {
      display: inline-flex; align-items: center; gap: 8px; padding: 7px 16px; border-radius: 999px;
      background: rgba(253,251,255,.92); border: 1.5px solid #D5C8F0; color: #574191;
      font-size: 13px; font-weight: 700; box-shadow: 0 6px 18px rgba(87,65,145,.08);
    }
    .gh-pill code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: #6E54B5; }
    .main { flex: 1; display: flex; align-items: center; gap: 38px; margin: 18px 0 14px; }
    .left { flex: 1.05; display: flex; flex-direction: column; gap: 16px; }
    .right { flex: 1.15; display: flex; align-items: center; justify-content: center; position: relative; }
    .tag {
      display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
      padding: 6px 14px; border-radius: 999px; background: #EAE3F8; color: #574191;
      font-size: 13px; font-weight: 700; border: 1px solid #D9CEF2;
    }
    h1 { font-size: 42px; line-height: 1.18; font-weight: 900; letter-spacing: -0.02em; color: #2F2547; }
    h1 span { color: #7B5FC9; }
    .sub { font-size: 16px; line-height: 1.65; color: #6B5E87; max-width: 500px; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
    .chip {
      padding: 8px 14px; border-radius: 12px; background: #FDFBFF; border: 1px solid #E0D8F0;
      font-size: 13.5px; font-weight: 600; color: #4A3D6A; box-shadow: 0 4px 14px rgba(87,65,145,.05);
    }
    .shot-frame {
      width: 100%; border-radius: 20px; overflow: hidden; background: #FDFBFF;
      border: 2px solid #DDD3F2; box-shadow: 0 22px 54px rgba(72,51,128,.16);
    }
    .shot-frame img { width: 100%; display: block; }
    .card {
      background: rgba(253,251,255,.94); border: 1.5px solid #E0D8F0; border-radius: 20px;
      padding: 20px 22px; box-shadow: 0 14px 36px rgba(87,65,145,.08);
    }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: 100%; }
    .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; width: 100%; }
    .footer {
      display: flex; align-items: center; justify-content: space-between;
      padding-top: 12px; border-top: 1px solid rgba(142,116,209,.2);
      font-size: 12.5px; color: #7C7096; font-weight: 600;
    }
    .footer strong { color: #574191; }
    .pet-badge {
      position: absolute; bottom: -16px; right: -12px; width: 150px; height: 150px;
      border-radius: 24px; background: rgba(253,251,255,.92); border: 2px solid #D8CCF2;
      box-shadow: 0 14px 30px rgba(87,65,145,.16); display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    .pet-badge img { width: 132px; height: 132px; object-fit: contain; }
  `;

  const wrapPoster = (num, title, bodyHtml) => `<!doctype html><html><head><meta charset="utf-8"><style>${commonCss}</style></head><body>
    <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
    <div class="wrap">
      <div class="topbar">
        <div class="brand"><span class="brand-dot"></span>PetLink v1.0.0 · 芋泥星夜主题</div>
        <div class="gh-pill">⭐ GitHub 开源：<code>github.com/xiaorannotes/PetLink</code></div>
      </div>
      <div class="main">${bodyHtml}</div>
      <div class="footer">
        <div><strong>PetLink</strong> · AI 编程状态感知与键鼠陪伴双信号桌面宠物 (macOS / Windows)</div>
        <div>开源地址：<strong>https://github.com/xiaorannotes/PetLink</strong> · Poster ${num}/09</div>
      </div>
    </div>
  </body></html>`;

  const posters = [
    {
      file: '海报01-主视觉总览.png',
      html: wrapPoster('01', '主视觉总览', `
        <div class="left">
          <div class="tag">✨ 正式开源 · macOS & Windows 双平台</div>
          <h1>AI 编程状态感知<br>与<span>键鼠陪伴</span>桌宠</h1>
          <p class="sub">把 9 大 AI Agent 的思考、写代码、等待确认与完成信号，与你的键盘敲击节奏融为一体。100% 本地 SQLite 零遥测，开源免费即刻上手。</p>
          <div class="chips">
            <div class="chip">🤖 9 大 AI Agent 一键联动</div>
            <div class="chip">🖱️ 像素级透明穿透不挡按钮</div>
            <div class="chip">🔒 本地 SQLite 零云端上传</div>
            <div class="chip">🎨 大肥鱼 106 段高清透明动画</div>
          </div>
        </div>
        <div class="right">
          <div class="shot-frame"><img src="${shotMap.connections}"></div>
          <div class="pet-badge"><img src="${dafeiyuFrames}action-working.png"></div>
        </div>
      `)
    },
    {
      file: '海报02-九大AI-Agent一键联动.png',
      html: wrapPoster('02', '九大 AI Agent', `
        <div class="left" style="flex:0.95">
          <div class="tag">🤖 零配置自动监测 · 告别繁琐命令行</div>
          <h1>全面接入 <span>9 大</span><br>主流 AI Agent</h1>
          <p class="sub">无需手动复制粘贴终端命令，控制页一键点击「启用自动监测」，自动通过本机 Hooks、会话日志元数据与客户端进程实时同步 AI 工作状态。</p>
          <div class="grid3" style="gap:10px;margin-top:6px;">
            ${['Antigravity', 'Claude Code', 'Codex', 'Cursor', 'DeepSeek', '豆包专业版', 'Muse', 'GrokBot', 'WorkBuddy']
              .map(n => `<div class="chip" style="text-align:center;padding:9px 8px;background:#EFEAFB;border-color:#D8CCF2;color:#574191;">${n}</div>`).join('')}
          </div>
        </div>
        <div class="right" style="flex:1.15">
          <div class="shot-frame"><img src="${shotMap.connections}"></div>
          <div class="pet-badge"><img src="${dafeiyuFrames}action-agent-working.png"></div>
        </div>
      `)
    },
    {
      file: '海报03-浏览器扩展免Token自动配对.png',
      html: wrapPoster('03', '浏览器扩展免 Token 配对', `
        <div class="left">
          <div class="tag">🌐 网页版 AI 专属伴侣 · Chrome / Edge</div>
          <h1>浏览器扩展<br><span>免 Token</span> 自动配对</h1>
          <p class="sub">专为 Windows 无桌面端的 <b>Muse</b> 以及网页版 <b>DeepSeek / 豆包 / Grok / WorkBuddy</b> 打造。加载扩展后自动与本机 Hub 握手配对，网页流式生成实时驱动桌宠！</p>
          <div class="chips">
            <div class="chip">⚡ 一键自动握手免填令牌</div>
            <div class="chip">📡 实时捕捉流式回复与完成</div>
            <div class="chip">🪟 完美补齐 Windows Muse 陪伴</div>
          </div>
        </div>
        <div class="right">
          <div class="card" style="width:100%;padding:28px;">
            <div style="font-size:18px;font-weight:800;color:#574191;margin-bottom:16px;">⚡ 3 步零配置连通网页端 AI</div>
            <div style="display:flex;flex-direction:column;gap:14px;">
              <div class="chip" style="padding:14px 16px;"><b>1. 加载扩展</b>：打开 <code>chrome://extensions</code> 加载包内 <code>PetLink-浏览器扩展</code></div>
              <div class="chip" style="padding:14px 16px;"><b>2. 自动握手</b>：扩展自动请求本机 <code>127.0.0.1:47821/v1/extension-handshake</code></div>
              <div class="chip" style="padding:14px 16px;"><b>3. 实时联动</b>：在 Muse / DeepSeek / 豆包 / Grok 对话，桌宠同步陪跑与庆祝</div>
            </div>
          </div>
          <div class="pet-badge"><img src="${dafeiyuFrames}action-done.png"></div>
        </div>
      `)
    },
    {
      file: '海报04-双信号融合与像素级穿透.png',
      html: wrapPoster('04', '双信号融合与像素级穿透', `
        <div class="left">
          <div class="tag">⚡ 双信号优先级引擎 × 像素级 Alpha 穿透</div>
          <h1>AI 紧急优先<br><span>透明区域</span>绝不挡屏</h1>
          <p class="sub">AI 等待确认或报错时第一时间切入提醒；日常敲键盘触发「敲敲 ~🐾」「码力 +1」轻浮字。实时检测像素 Alpha 通道，角色四周透明区域点击 100% 穿透底层窗口。</p>
          <div class="chips">
            <div class="chip">🚨 P1: AI 等待确认 / 报错 / 完成</div>
            <div class="chip">⌨️ P2: 键盘活跃打字浮字陪伴</div>
            <div class="chip">🛡️ 鼠标像素级穿透不挡按键</div>
          </div>
        </div>
        <div class="right">
          <div class="grid2">
            <div class="card" style="text-align:center;">
              <img src="${dafeiyuFrames}action-working.png" style="height:150px;object-fit:contain;margin-bottom:10px;">
              <div style="font-weight:800;color:#574191;">AI 工作中 / 专注敲码</div>
              <div style="font-size:12.5px;color:#7C7096;margin-top:4px;">敲敲 ~🐾 · 码力 +1 轻浮字</div>
            </div>
            <div class="card" style="text-align:center;">
              <img src="${dafeiyuFrames}action-waiting.png" style="height:150px;object-fit:contain;margin-bottom:10px;">
              <div style="font-weight:800;color:#574191;">AI 等待输入提醒</div>
              <div style="font-size:12.5px;color:#7C7096;margin-top:4px;">最高优先级瞬间切入提醒</div>
            </div>
            <div class="card" style="text-align:center;">
              <img src="${dafeiyuFrames}action-done.png" style="height:150px;object-fit:contain;margin-bottom:10px;">
              <div style="font-weight:800;color:#574191;">任务完成庆祝</div>
              <div style="font-size:12.5px;color:#7C7096;margin-top:4px;">自动发放 +3 陪伴积分</div>
            </div>
            <div class="card" style="text-align:center;">
              <img src="${dafeiyuFrames}action-sleep.png" style="height:150px;object-fit:contain;margin-bottom:10px;">
              <div style="font-weight:800;color:#574191;">离开 5 分钟安心休眠</div>
              <div style="font-size:12.5px;color:#7C7096;margin-top:4px;">仅键盘触发活跃，鼠标不误触</div>
            </div>
          </div>
        </div>
      `)
    },
    {
      file: '海报05-三配列键盘热力图.png',
      html: wrapPoster('05', '三配列键盘热力图', `
        <div class="left" style="flex:0.9">
          <div class="tag">🔥 R-3 键盘热力图 · 三配列自由切换</div>
          <h1>看见你的<br><span>指尖专注轨迹</span></h1>
          <p class="sub">内置 104 全尺寸、87 TKL、75% 紧凑三种机械键盘配列，提供 4 套精选渐变预设与 5 档自定义取色器，纯本机计数渲染。</p>
          <div class="chips">
            <div class="chip">⌨️ 104 / 87 / 75% 三配列</div>
            <div class="chip">🎨 4 套渐变 + 5 档取色器</div>
            <div class="chip">🔒 只记键位频次不记文本</div>
          </div>
        </div>
        <div class="right" style="flex:1.25">
          <div class="shot-frame"><img src="${shotMap.heatmap}"></div>
        </div>
      `)
    },
    {
      file: '海报06-今日陪伴日报长图.png',
      html: wrapPoster('06', '今日陪伴日报长图', `
        <div class="left" style="flex:0.9">
          <div class="tag">📊 R-4 一键导出 2x 高清 PNG 日报</div>
          <h1>把今天的工作<br>生成<span>陪伴日报</span></h1>
          <p class="sub">汇总今日敲击、点击与滚轮总量，附带趣味物理换算（指尖跃动米数、千卡专注花火）、24 小时双轴活跃曲线与 AI 协同统计，一键本地保存分享。</p>
          <div class="chips">
            <div class="chip">📈 24 小时键鼠活跃双轴曲线</div>
            <div class="chip">✨ 趣味物理换算 & AI 协同摘要</div>
            <div class="chip">🖼️ 离线 2x Retina 高清导出</div>
          </div>
        </div>
        <div class="right" style="flex:1.25">
          <div class="shot-frame"><img src="${shotMap.report}"></div>
        </div>
      `)
    },
    {
      file: '海报07-三套治愈皮肤与投喂小铺.png',
      html: wrapPoster('07', '三套主题与投喂小铺', `
        <div class="left" style="flex:0.92">
          <div class="tag">🍰 R-5 芋泥星夜默认主题 × 21 款美食小铺</div>
          <h1>三套治愈皮肤<br>与<span>专注里程碑</span></h1>
          <p class="sub">默认「芋泥星夜」紫调皮肤，一键切换「薄荷奶绿」与「蜜桃米白」。敲击满 500 / 2000 次与生成日报均可领取积分，在 21 款美食小铺兑换投喂！</p>
          <div class="chips">
            <div class="chip">💜 芋泥星夜（默认）</div>
            <div class="chip">💚 薄荷奶绿 · 🩷 蜜桃米白</div>
            <div class="chip">🍓 21 款美食投喂 + 里程碑积分</div>
          </div>
        </div>
        <div class="right" style="flex:1.2">
          <div class="shot-frame"><img src="${shotMap.companion}"></div>
        </div>
      `)
    },
    {
      file: '海报08-双角色与专属IP定制.png',
      html: wrapPoster('08', '百段动作与专属 IP 定制', `
        <div class="left" style="flex:0.95">
          <div class="tag">🎨 大肥鱼 106 段透明 WebM 高清动画</div>
          <h1>百段动作陪伴<br>支持<span>专属 IP 定制</span></h1>
          <p class="sub">内置 106 段流畅透明动画的「大肥鱼」，支持一键导入本地自定义角色包；也欢迎把你的原创 OC 或品牌吉祥物定制成专属桌宠！</p>
          <div class="card" style="padding:14px 18px;background:#EFEAFB;border-color:#CFC0EE;">
            <div style="font-size:15px;font-weight:800;color:#574191;">💬 专属角色定制联系微信号：XiaoRanNotes</div>
            <div style="font-size:12.5px;color:#6B5E87;margin-top:4px;">软件内「宠物」页支持一键复制微信号，随时沟通定制方案</div>
          </div>
        </div>
        <div class="right" style="flex:1.18">
          <div class="shot-frame"><img src="${shotMap.pets}"></div>
        </div>
      `)
    },
    {
      file: '海报09-本地SQLite隐私与开源下载.png',
      html: wrapPoster('09', '隐私承诺与开源下载', `
        <div class="left">
          <div class="tag">🔒 100% 本地 SQLite · MIT 协议开源</div>
          <h1>零遥测隐私设计<br><span>即刻开源下载</span></h1>
          <p class="sub">使用 Node.js 原生 <code>node:sqlite</code> (<code>WITHOUT ROWID</code>) 聚合表仅存本机，绝不记录输入正文、按键顺序或窗口标题。现已发布 macOS <code>.dmg</code> 与 Windows <code>.zip</code>。</p>
          <div class="card" style="padding:16px 20px;background:#EFEAFB;border-color:#CFC0EE;">
            <div style="font-size:14px;font-weight:800;color:#574191;">⭐ GitHub 开源仓库 & Release 下载</div>
            <div style="font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700;color:#4B3587;margin-top:6px;">https://github.com/xiaorannotes/PetLink</div>
          </div>
        </div>
        <div class="right">
          <div class="grid2">
            <div class="card">
              <div style="font-size:28px;margin-bottom:8px;">🍎</div>
              <div style="font-size:16px;font-weight:800;color:#574191;">macOS 安装镜像</div>
              <div style="font-size:13px;color:#6B5E87;margin-top:6px;"><code>PetLink-Mac-arm64.dmg</code><br>打开拖拽至 Applications 即用</div>
            </div>
            <div class="card">
              <div style="font-size:28px;margin-bottom:8px;">🪟</div>
              <div style="font-size:16px;font-weight:800;color:#574191;">Windows 免安装包</div>
              <div style="font-size:13px;color:#6B5E87;margin-top:6px;"><code>PetLink-Win-x64.zip</code><br>解压双击 PetLink.exe 即用</div>
            </div>
            <div class="card">
              <div style="font-size:28px;margin-bottom:8px;">🗄️</div>
              <div style="font-size:16px;font-weight:800;color:#574191;">本地 SQLite 隐私</div>
              <div style="font-size:13px;color:#6B5E87;margin-top:6px;">只记键位计数与时间桶<br>零云端上传 · 零遥测</div>
            </div>
            <div class="card">
              <div style="font-size:28px;margin-bottom:8px;">🧪</div>
              <div style="font-size:16px;font-weight:800;color:#574191;">178 项单测全绿</div>
              <div style="font-size:13px;color:#6B5E87;margin-top:6px;">完整开源代码与文档<br>欢迎 Star & PR 共建</div>
            </div>
          </div>
        </div>
      `)
    }
  ];

  // Create offscreen poster renderer window at 1200x675 @ 2x = 2400x1350
  await main.eval(`(() => {
    const { BrowserWindow } = process.mainModule.require('electron');
    global.__posterWin = new BrowserWindow({
      width: 1200, height: 675, show: false,
      webPreferences: { offscreen: false, webSecurity: false }
    });
    global.__posterWin.loadURL('about:blank');
  })()`);
  await sleep(400);
  const allTargets = await targets(9394);
  const posterTarget = allTargets.find(t => t.url === 'about:blank');
  const posterClient = await connect(posterTarget); clients.push(posterClient);
  await posterClient.send('Emulation.setDeviceMetricsOverride', {
    width: 1200, height: 675, deviceScaleFactor: 2, mobile: false
  });

  for (const p of posters) {
    const htmlFile = path.join(base, p.file.replace('.png', '.html'));
    await writeFile(htmlFile, p.html, 'utf8');
    await posterClient.send('Page.navigate', { url: pathToFileURL(htmlFile).href });
    await sleep(600);
    const broken = await posterClient.eval(`Array.from(document.querySelectorAll('img')).filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src)`);
    if (broken.length > 0) throw new Error(`Broken images in ${p.file}: ${broken.join(', ')}`);
    const outFile = path.join(outDir, p.file);
    await posterClient.capture(outFile);
    await copyFile(outFile, path.join(docsDir, p.file));
    console.log('Generated:', outFile);
  }
} finally {
  for (const c of clients) { try { c.close(); } catch {} }
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
}
