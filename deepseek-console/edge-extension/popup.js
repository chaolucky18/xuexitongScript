const DEFAULTS = { endpoint: 'http://127.0.0.1:37841', token: '' };

const tokenInput = document.getElementById('token');
const endpointInput = document.getElementById('endpoint');
const statusEl = document.getElementById('status');
const messageEl = document.getElementById('message');
const toggleButton = document.getElementById('toggle');

function setStatus(kind, text) {
    statusEl.dataset.kind = kind;
    statusEl.textContent = text;
}

function setMessage(text, kind = '') {
    messageEl.textContent = text;
    messageEl.dataset.kind = kind;
}

function normalizeEndpoint(value) {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    return trimmed || DEFAULTS.endpoint;
}

async function readConfig() {
    const stored = await chrome.storage.local.get(DEFAULTS);
    return {
        endpoint: normalizeEndpoint(stored.endpoint),
        token: String(stored.token || '').trim(),
    };
}

async function saveConfig() {
    const config = {
        endpoint: normalizeEndpoint(endpointInput.value),
        token: tokenInput.value.trim(),
    };
    await chrome.storage.local.set(config);
    endpointInput.value = config.endpoint;
    return config;
}

async function ping(endpoint, token) {
    try {
        const response = await fetch(`${endpoint}/health`, {
            headers: { 'X-Xuexitong-Token': token },
            signal: AbortSignal.timeout(5000),
        });
        const data = await response.json().catch(() => null);
        if (response.ok) return { ok: true, data };
        return { ok: false, error: data?.error || `HTTP ${response.status}` };
    } catch (error) {
        return { ok: false, error: error?.name === 'TimeoutError' ? '连接超时' : error.message };
    }
}

async function refresh(config) {
    if (!config.token) {
        setStatus('idle', '未配置令牌');
        return;
    }
    setStatus('idle', '检测中…');
    const result = await ping(config.endpoint, config.token);
    if (result.ok) {
        setStatus('ok', '服务已连接');
        setMessage(`本地服务正常（${config.endpoint}，模型 ${result.data?.model || 'deepseek'}）。`, 'ok');
    } else {
        setStatus('bad', '未连接');
        setMessage(`连接失败：${result.error}。确认启动窗口还在运行，令牌与该窗口打印的一致。`, 'bad');
    }
}

document.getElementById('save').addEventListener('click', async () => {
    const config = await saveConfig();
    setMessage('已保存。打开学习通课程播放页即可自动运行。', 'ok');
    await refresh(config);
});

document.getElementById('test').addEventListener('click', async () => {
    const config = await saveConfig();
    setMessage('正在测试连接…');
    await refresh(config);
});

toggleButton.addEventListener('click', () => {
    const showing = tokenInput.type === 'text';
    tokenInput.type = showing ? 'password' : 'text';
    toggleButton.textContent = showing ? '显示' : '隐藏';
});

tokenInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') document.getElementById('save').click();
});

(async () => {
    const config = await readConfig();
    tokenInput.value = config.token;
    endpointInput.value = config.endpoint;
    await refresh(config);
})();