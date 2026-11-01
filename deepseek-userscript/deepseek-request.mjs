const API_URL = 'https://api.deepseek.com/chat/completions';
const ATTEMPTS = [
    {max_tokens: 2200, temperature: 0},
    {max_tokens: 3200, temperature: 0.1},
];
const SYSTEM_PROMPT = '按题意直接选出答案。题干或选项可能经过网页防复制处理，出现个别汉字被替换、插入无关字或词语不顺畅时，结合上下文和选项在内部判断，不要输出推理过程，也不要解释答案。每题都必须给非空答案，只用该题提供的选项字母且不可重复；单选和判断选一个，多选列出所有正确项。不确定时选最可能的答案。id须对应题号。只输出JSON：{"answers":[{"id":1,"letters":["A"]}]}。';

export async function requestAnswers(questions, apiKey, fetchImpl = fetch) {
    let lastProblem = '';
    for (const settings of ATTEMPTS) {
        const body = {
            model: 'deepseek-flash',
            stream: false,
            // Omitting this field enables thinking by default on DeepSeek Flash.
            thinking: {type: 'disabled'},
            response_format: {type: 'json_object'},
            ...settings,
            messages: [
                {role: 'system', content: SYSTEM_PROMPT},
                {role: 'user', content: JSON.stringify(questions)},
            ],
        };
        const response = await fetchImpl(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120000),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            const detail = data?.error?.message || data?.error || data?.message || '';
            throw new Error(`DeepSeek API 返回 HTTP ${response.status}${detail ? `：${detail}` : ''}`);
        }
        const choice = data?.choices?.[0];
        const reason = choice?.finish_reason;
        if (reason === 'length') {
            lastProblem = `DeepSeek 输出达到长度上限（已生成 ${data.usage?.completion_tokens ?? '未知'} tokens）`;
            if (questions.length > 1) {
                const middle = Math.ceil(questions.length / 2);
                console.warn(`${lastProblem}，正在拆成更小的题目批次`);
                const first = await requestAnswers(questions.slice(0, middle), apiKey, fetchImpl);
                const second = await requestAnswers(questions.slice(middle), apiKey, fetchImpl);
                return [...first, ...second];
            }
        } else if (reason !== 'stop') {
            throw new Error(`DeepSeek 未正常结束（finish_reason=${reason ?? '缺失'}）`);
        } else {
            try {
                const parsed = JSON.parse(choice.message?.content || '');
                const answers = parsed?.answers;
                if (Array.isArray(answers) && answers.length === questions.length) {
                    const byId = new Map(answers.map(answer => [answer.id, answer]));
                    const ordered = questions.map(question => byId.get(question.id));
                    if (ordered.every(Boolean)) return ordered;
                }
                lastProblem = 'DeepSeek 返回格式不完整';
            } catch {
                lastProblem = 'DeepSeek 返回空内容或无法解析 JSON';
            }
        }
        console.warn(`${lastProblem}，正在重试`);
    }
    throw new Error(`${lastProblem}；没有获得完整答案，未填答或提交题目`);
}
