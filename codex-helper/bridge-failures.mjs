export function classifyCliFailure(stderr, now = Date.now()) {
    const text = String(stderr || '');
    if (/you[’']ve hit your usage limit|usage limit (?:reached|exceeded)|insufficient_quota/i.test(text)) {
        let retryAt = now + 15 * 60000;
        const clock = text.match(/try again at\s+(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
        if (clock && Number(clock[1]) >= 1 && Number(clock[1]) <= 12 && Number(clock[2]) < 60) {
            const target = new Date(now);
            target.setHours(Number(clock[1]) % 12 + (/PM/i.test(clock[3]) ? 12 : 0), Number(clock[2]), 0, 0);
            if (target.getTime() < now - 5 * 60000) target.setDate(target.getDate() + 1);
            retryAt = Math.max(now + 60000, target.getTime() + 60000);
        }
        return { code: 'usage_limit', status: 429, retryAt,
            message: 'Codex 使用额度暂不可用，等待额度恢复后自动重试' };
    }
    if (/not logged in|authentication failed|token (?:has )?expired|please (?:log|sign) in|invalid_api_key|401 Unauthorized/i.test(text)) {
        return { code: 'authentication', status: 401, message: 'Codex 登录已失效，请重新登录本机 Codex' };
    }
    if (/rate limit|too many requests|429 Too Many/i.test(text)) {
        return { code: 'rate_limit', status: 429, retryAt: now + 30000, message: 'Codex 请求暂时受限，稍后自动重试' };
    }
    if (/connection (?:reset|closed)|ECONNRESET|ETIMEDOUT|timed out|network (?:error|unreachable)|error sending request|stream disconnected|503 Service|502 Bad|500 Internal/i.test(text)) {
        return { code: 'temporary_connection', status: 503, retryAt: now + 15000, message: 'Codex 网络连接暂时失败，稍后自动重试' };
    }
    return null;
}

export function cliFailure(stderr, exitCode, now = Date.now()) {
    const detail = classifyCliFailure(stderr, now);
    return Object.assign(new Error(detail?.message || `Codex退出码${exitCode}，请检查本机错误日志`), detail || {});
}
