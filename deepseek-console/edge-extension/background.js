// 后台 service worker：唯一能自由访问 127.0.0.1 的地方。
// 走这里的请求不经过页面的 CORS / Private Network Access 限制，
// 所以不再需要在网页上弹“允许访问本地网络”的对话框。
const DEFAULTS = { endpoint: 'http://127.0.0.1:37841', token: '' };
const HEALTH_TIMEOUT_MS = 10000;
const LOG_TIMEOUT_MS = 5000;
const ANSWER_TIMEOUT_MS = 900000;

async function getConfig() {
    const stored = await chrome.storage.local.get(DEFAULTS);
    return {
        endpoint: String(stored.endpoint || DEFAULTS.endpoint).replace(/\/+$/, ''),
        token: String(stored.token || '').trim(),
    };
}

async function forward(op, payload) {
    const { endpoint, token } = await getConfig();
    if (!token) {
        return { ok: false, error: '扩展还没有配置本地服务令牌：点开工具栏的“学习通助手”图标，粘贴令牌并保存。' };
    }
    const isHealth = op === 'health';
    const isLog = op === 'log';
    const isFile = op === 'file';
    const isGet = isHealth;
    const url = `${endpoint}${isHealth ? '/health' : isLog ? '/log' : isFile ? '/file' : op === 'ocr' ? '/ocr' : '/answer'}`;
    const init = { method: isGet ? 'GET' : 'POST', headers: { 'X-Xuexitong-Token': token } };
    if (!isGet) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(payload);
    }

    // 答题可能持续两分钟，期间定时调一次扩展 API 来重置 service worker 的空闲计时器。
    const keepAlive = setInterval(() => {
        chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
    }, 20000);

    try {
        const response = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(isHealth ? HEALTH_TIMEOUT_MS : isLog ? LOG_TIMEOUT_MS : isFile ? 60000 : op === 'ocr' ? 40000 : ANSWER_TIMEOUT_MS),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            return { ok: false, error: data?.error || `本地服务返回 HTTP ${response.status}` };
        }
        if (!data) return { ok: false, error: '本地服务返回了无法解析的内容' };
        return { ok: true, data };
    } catch (error) {
        const message = error?.name === 'TimeoutError' ? '等待本地服务响应超时' : (error?.message || String(error));
        return { ok: false, error: `无法连接本地服务（${endpoint}）：${message}` };
    } finally {
        clearInterval(keepAlive);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.__xxth !== 'service') return false;
    forward(message.op, message.payload).then(sendResponse);
    return true;
});