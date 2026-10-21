const DEFAULT_API_URL = 'https://api.deepseek.com/chat/completions';
const REQUEST_TIMEOUT_MS = 120000;
const RETRY_DELAY_MS = 1500;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

// 第一档正常求解；第二档只在前一次被截断/格式坏时用，放开输出额度。
// reasoning_effort 之前是 'low'，实测题目被干扰字污染时明显不够用，提高到 high。
const ATTEMPTS = [
    { thinking: { type: 'enabled' }, reasoning_effort: 'high', max_tokens: 12000 },
    { thinking: { type: 'enabled' }, reasoning_effort: 'high', max_tokens: 20000 },
];

const SYSTEM_PROMPT =
    '按题意回答全部题目。注意：题干或选项可能经过网页防复制处理，出现个别汉字被替换、插入无关字，或词语看起来不通顺。' +
    '先结合上下文和选项在内部还原最可能的原句，再按还原后的题意作答；不要把明显异常的替换字当作专业术语，也不要因无法逐字还原而放弃。' +
    '每题都必须给非空答案，只用该题提供的选项字母且不可重复；单选和判断选一个，多选列出所有正确项。不确定时选最可能的答案。' +
    'id须对应题号。只输出JSON：{"answers":[{"id":1,"letters":["A"]}]}。';

export async function requestAnswers(questions, apiKey, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const apiUrl = options.apiUrl || DEFAULT_API_URL;
    const model = options.model || process.env.DEEPSEEK_MODEL || 'deepseek-flash';
    const onUsage = typeof options.onUsage === 'function' ? options.onUsage : null;
    let lastProblem = '';

    for (const [index, settings] of ATTEMPTS.entries()) {
        const attemptNo = index + 1;
        if (attemptNo > 1) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

        const body = {
            model,
            stream: false,
            response_format: { type: 'json_object' },
            ...settings,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: JSON.stringify(questions) },
            ],
        };

        let response;
        try {
            response = await fetchImpl(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            throw new Error(`无法连接 DeepSeek API：${error.message}`);
        }

        const data = await response.json().catch(() => null);

        if (onUsage) {
            const usage = data?.usage || {};
            onUsage({
                attempt: attemptNo,
                model,
                reasoningEffort: settings.reasoning_effort || null,
                maxTokens: settings.max_tokens,
                promptTokens: usage.prompt_tokens ?? null,
                completionTokens: usage.completion_tokens ?? null,
                reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
                finishReason: data?.choices?.[0]?.finish_reason ?? null,
            });
        }

        if (!response.ok) {
            const detail = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || data?.message || '';
            const message = `DeepSeek API 返回 HTTP ${response.status}${detail ? `：${detail}` : ''}`;
            if (!RETRYABLE_STATUS.has(response.status)) throw new Error(message);
            lastProblem = message;
        } else {
            const choice = data?.choices?.[0];
            const reason = choice?.finish_reason;
            if (reason === 'length') {
                lastProblem = `第 ${attemptNo} 次输出达到长度上限（已生成 ${data.usage?.completion_tokens ?? '未知'} tokens）`;
            } else if (reason !== 'stop') {
                throw new Error(`DeepSeek 未正常结束（finish_reason=${reason ?? '缺失'}）`);
            } else {
                try {
                    const answer = JSON.parse(choice.message?.content || '');
                    if (Array.isArray(answer.answers) && answer.answers.length === questions.length) {
                        return answer.answers;
                    }
                    lastProblem = `第 ${attemptNo} 次返回的题目数量与请求不一致`;
                } catch {
                    lastProblem = `第 ${attemptNo} 次返回空内容或无法解析 JSON`;
                }
            }
        }

        if (attemptNo < ATTEMPTS.length) {
            const next = ATTEMPTS[index + 1];
            console.warn(`${lastProblem}，正在重试（第 ${attemptNo + 1}/${ATTEMPTS.length} 次，max_tokens=${next.max_tokens ?? '默认'}）`);
        }
    }

    throw new Error(`${lastProblem}；共尝试 ${ATTEMPTS.length} 次仍未获得完整答案，没有选择或提交题目`);
}