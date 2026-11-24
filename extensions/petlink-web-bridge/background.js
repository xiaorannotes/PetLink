async function ensurePaired() {
  let { port = 17321, token = '' } = await chrome.storage.local.get(['port', 'token']);
  if (token) return { port, token };
  for (const candidatePort of [port, 17321, 17322, 17323]) {
    try {
      const res = await fetch(`http://127.0.0.1:${candidatePort}/v1/extension-handshake`);
      if (res.ok) {
        const data = await res.json();
        if (data?.token) {
          await chrome.storage.local.set({ port: data.port || candidatePort, token: data.token });
          return { port: data.port || candidatePort, token: data.token };
        }
      }
    } catch {}
  }
  return { port, token: '' };
}

async function sendToHub(source, state) {
  let { port, token } = await ensurePaired();
  if (!token) return { ok: false, message: '未检测到运行中的 PetLink，请先启动 PetLink 桌面端' };
  try {
    let res = await fetch(`http://127.0.0.1:${port}/v1/event`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-petlink-token': token.trim()
      },
      body: JSON.stringify({
        v: 1,
        source,
        session: `web-${source}`,
        state,
        ts: Date.now()
      })
    });
    if (res.status === 401) {
      await chrome.storage.local.remove(['token']);
      const repaired = await ensurePaired();
      if (repaired.token) {
        res = await fetch(`http://127.0.0.1:${repaired.port}/v1/event`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-petlink-token': repaired.token.trim()
          },
          body: JSON.stringify({
            v: 1,
            source,
            session: `web-${source}`,
            state,
            ts: Date.now()
          })
        });
      }
    }
    return { ok: res.ok, status: res.status, port };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

chrome.runtime.onInstalled?.addListener(() => { ensurePaired(); });
chrome.runtime.onStartup?.addListener(() => { ensurePaired(); });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'petlink-pair') {
    chrome.storage.local.remove(['token']).then(() => ensurePaired()).then(async ({ port, token }) => {
      if (!token) return sendResponse({ ok: false, message: '请确认 PetLink 桌面端已启动' });
      const r = await sendToHub('deepseek', 'done');
      sendResponse({ ...r, port, paired: !!token });
    });
    return true;
  }
  if (msg?.type === 'petlink-state' && msg.source && msg.state) {
    sendToHub(msg.source, msg.state).then(sendResponse);
    return true;
  }
});
