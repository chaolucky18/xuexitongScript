const API_URL = 'https://api.deepseek.com/chat/completions';
const ATTEMPTS = [
    { thinking: { type: 'enabled' }, reasoning_effort: 'low', max_tokens: 8192 },
    { thinking: { type: 'disabled' }, max_tokens: 8192 },
];

export async function requestAnswers(questions, apiKey, fetchImpl = fetch) {
    let lastProblem = '';
    for (const [index, settings] of ATTEMPTS.entries()) {
        const body = {
            model: 'deepseek-flash',
            stream: false,
            response_format: { type: 'json_object' },
            ...settings,
            messages: [
                { role: 'system', content: '你是答题助手。根据题意和选项作答。只输出 JSON 对象，格式为 {"answers":[{"id":1,"letters":["A"]}]}。单选和判断只能给一个字母，多选给所有正确字母。无法判断时给空数组，不要猜测，不要输出解释。' },
                { role: 'user', content: JSON.stringify(questions) },
            ],
        };
        const response = await fetchImpl(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120000),
        });
        if (!response.ok) throw new Error(`DeepSeek API 返回 HTTP ${response.status}`);
        const data = await response.json();
        const choice = data.choices?.[0];
        const reason = choice?.finish_reason;
        if (reason === 'length') {
            lastProblem = `DeepSeek 输出达到长度上限（已生成 ${data.usage?.completion_tokens ?? '未知'} tokens）`;
        } else if (reason !== 'stop') {
            throw new Error(`DeepSeek 未正常结束（finish_reason=${reason ?? '缺失'}）`);
        } else {
            try {
                const answer = JSON.parse(choice.message?.content || '');
                if (Array.isArray(answer.answers)) return answer.answers;
                lastProblem = 'DeepSeek 返回的 JSON 缺少 answers 数组';
            } catch {
                lastProblem = 'DeepSeek 返回空内容或无法解析 JSON';
            }
        }
        if (index + 1 < ATTEMPTS.length) console.warn(`${lastProblem}，正在重试`);
    }
    throw new Error(`${lastProblem}，自动重试后仍未获得完整答案；没有选择或提交题目`);
}
