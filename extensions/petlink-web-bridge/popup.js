const portEl = document.getElementById('port');
const tokenEl = document.getElementById('token');
const statusEl = document.getElementById('status');

async function runAutoPair() {
  statusEl.textContent = '正在自动连接本机 PetLink...';
  const res = await chrome.runtime.sendMessage({ type: 'petlink-pair' });
  if (res?.ok) {
    statusEl.textContent = `✓ 已自动配对本机 PetLink (端口 ${res.port})！桌宠已联动。`;
    const { port, token } = await chrome.storage.local.get(['port', 'token']);
    if (port) portEl.value = port;
    if (token) tokenEl.value = token;
  } else {
    statusEl.textContent = `✗ ${res?.message || '请确认 PetLink 桌面端已启动'}`;
  }
}

document.getElementById('auto-pair').onclick = runAutoPair;

document.getElementById('save').onclick = async () => {
  const port = Number(portEl.value) || 17321;
  const token = tokenEl.value.trim();
  await chrome.storage.local.set({ port, token });
  await runAutoPair();
};

runAutoPair();
