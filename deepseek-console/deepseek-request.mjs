const API_URL = 'https://api.deepseek.com/chat/completions';
const ATTEMPTS = [
                { thinking: { type: 'enabled' }, reasoning_effort: 'low', max_tokens: 4096 },
    { thinking: { type: 'disabled' }, max_tokens: 8192 },
];

export async function requestAnswers(questions, apiKey, fetchImpl = fetch) {
    const allAnswers = [];
    for (const question of questions) {
        let lastProblem = '';
        for (const [index, settings] of ATTEMPTS.entries()) {
            const body = {
                model: 'deepseek-flash',
                stream: false,
                response_format: { type: 'json_object' },
                ...settings,
                messages: [
                    { role: 'system', content: '按题意选择正确选项。只输出 JSON：{"answers":[{"id":1,"letters":["A"]}]}。单选和判断选一个，多选列全；无法判断时给空数组。' },
                    { role: 'user', content: JSON.stringify([question]) },
                ],
            };
            const response = await fetchImpl(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(120000),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                const detail = data?.error?.message || data?.error || data?.message || '';
                if (/context.?length|input.?token|token.{0,20}(limit|length)|上下文|输入.{0,8}token/i.test(String(detail))) {
                    throw new Error(`第 ${question.id} 题单独发送仍超过 DeepSeek 输入长度限制；请检查题干或选项是否异常冗长。`);
                }
                throw new Error(`DeepSeek API 返回 HTTP ${response.status}${detail ? `：${detail}` : ''}`);
            }
            const choice = data?.choices?.[0];
            const reason = choice?.finish_reason;
            if (reason === 'length') {
                lastProblem = `DeepSeek 输出达到长度上限（已生成 ${data.usage?.completion_tokens ?? '未知'} tokens）`;
            } else if (reason !== 'stop') {
                throw new Error(`DeepSeek 未正常结束（finish_reason=${reason ?? '缺失'}）`);
            } else {
                try {
                    const answer = JSON.parse(choice.message?.content || '');
                    if (Array.isArray(answer.answers) && answer.answers.length === 1) {
                        allAnswers.push(...answer.answers);
                        lastProblem = '';
                        break;
                    }
                    lastProblem = 'DeepSeek 返回格式不完整';
                } catch {
                    lastProblem = 'DeepSeek 返回空内容或无法解析 JSON';
                }
            }
            if (index + 1 < ATTEMPTS.length) console.warn(`第 ${question.id} 题：${lastProblem}，正在重试`);
        }
        if (lastProblem) throw new Error(`第 ${question.id} 题：${lastProblem}；重试后仍未获得完整答案，没有选择或提交题目`);
    }
    return allAnswers;
}
