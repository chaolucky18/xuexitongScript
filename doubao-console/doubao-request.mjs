/**
 * 用豆包桌面版回答学习通题目（替代 DeepSeek API）。
 *
 * 与 deepseek-request.mjs 的区别：
 * - 不需要 API Key，靠本机豆包客户端（CDP 驱动，见 desktop-doubao/）
 * - 默认不新建对话（DOUBAO_NEW_CHAT=1 可改），每次在 prompt 里要求忽略上下文
 * - 提问内容一次性发出，要求只返回 JSON
 */
import { connect } from '../desktop-doubao/lib/doubao.mjs';

const DEBUG_PORT = Number(process.env.DOUBAO_DEBUG_PORT || 9333);
const NEW_CHAT = process.env.DOUBAO_NEW_CHAT === '1';
const ANSWER_TIMEOUT_MS = Number(process.env.DOUBAO_TIMEOUT_SECONDS || 180) * 1000;
const CHAT_NAME = process.env.DOUBAO_CHAT_NAME || '学习通答案搜索';

let client = null;
let named = false;

async function getClient() {
    if (!client) client = await connect({ port: DEBUG_PORT });
    return client;
}

/** 第一次请求前把当前会话改名；失败只告警，不影响答题。 */
async function ensureConversationName(current) {
    if (named) return;
    named = true;
    try {
        const result = await current.renameConversation(CHAT_NAME);
        console.log(result.renamed
            ? `会话已重命名为「${result.title}」`
            : `会话名已是「${result.title}」`);
    } catch (error) {
        console.warn(`会话重命名失败（不影响答题）：${error.message}`);
    }
}

function buildPrompt(questions, { strict = false } = {}) {
    const count = questions.length;
    return [
        '忽略之前对话中的所有内容，只处理下面这一份测验。',
        '遇到不确定、需要最新信息或需要核实事实的题目，先使用联网搜索核实，再根据搜索结果作答；不要凭猜测编造。',
        strict ? '你上一次的输出不是合法 JSON。这次必须只输出 JSON，不要任何解释或代码块标记。' : '',
        '严格只输出 JSON，不要解释、不要代码块、不要任何多余前后缀。',
        '格式：{"answers":[{"id":1,"letters":["A"]}]}',
        '（上面这行只是格式示例，不要原样输出，直接给本题答案）',
        '要求：',
        `1) 必须输出恰好 ${count} 条，id 从 1 到 ${count} 连续，与题目顺序一一对应；`,
        '2) 单选题和判断题每条只能有 1 个字母；多选题列出全部正确项；',
        '3) letters 只能取该题提供的选项字母，不能重复，不能自造；',
        '4) 每题都必须有答案，不确定时也要给最可能的一项；',
        '5) 除 JSON 外不要输出任何字符。',
        '题干可能有个别错字或被替换的字，先结合上下文与选项还原题意再作答。',
        '题目 JSON：',
        JSON.stringify(questions),
    ].filter(Boolean).join('\n');
}

/** 扫描文本里所有「括号配平」的 JSON 对象（忽略字符串里的花括号）。 */
function extractJsonObjects(text) {
    const objects = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{') {
            if (depth === 0) start = i;
            depth += 1;
        } else if (ch === '}') {
            if (depth > 0) {
                depth -= 1;
                if (depth === 0 && start >= 0) {
                    objects.push(text.slice(start, i + 1));
                    start = -1;
                }
            }
        }
    }
    return objects;
}

/**
 * 从模型输出里提取 answers。
 * 豆包有时会先回显 prompt 里的格式示例，再给真答案（两段 JSON 粘在一起），
 * 所以不能简单取「第一个 { 到最后一个 }」。
 */
export function parseAnswers(text, expectedCount = 0) {
    const cleaned = String(text || '')
        .replace(/```json/gi, '```')
        .replace(/```/g, '')
        .trim();

    const candidates = [];
    try {
        const whole = JSON.parse(cleaned);
        if (whole && Array.isArray(whole.answers)) candidates.push(whole);
    } catch (_) { /* 整段不是单个 JSON，继续扫描 */ }

    for (const chunk of extractJsonObjects(cleaned)) {
        try {
            const data = JSON.parse(chunk);
            if (data && Array.isArray(data.answers)) candidates.push(data);
        } catch (_) { /* 残缺对象跳过 */ }
    }

    if (!candidates.length) {
        throw new Error(`豆包输出里没有可解析的 answers JSON（开头：${cleaned.slice(0, 80)}）`);
    }

    const exact = expectedCount ? candidates.filter((item) => item.answers.length === expectedCount) : [];
    const pool = exact.length ? exact : candidates;
    return pool[pool.length - 1].answers;
}

/**
 * @param {Array<{id:number,type:string,question:string,options:Array<{letter:string,text:string}>}>} questions
 * @returns {Promise<Array<{id:number,letters:string[]}>>}
 */
export async function requestAnswers(questions) {
    if (!Array.isArray(questions) || !questions.length) throw new Error('没有题目');

    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const current = await getClient();
            await ensureConversationName(current);
            const result = await current.ask(buildPrompt(questions, { strict: attempt > 0 }), {
                newChat: NEW_CHAT,
                timeoutMs: ANSWER_TIMEOUT_MS,
            });
            const answers = parseAnswers(result.text, questions.length);
            if (answers.length !== questions.length) {
                throw new Error(`豆包返回 ${answers.length} 个答案，题目有 ${questions.length} 道`);
            }
            return answers;
        } catch (error) {
            lastError = error;
            // 连接断了就重建一次
            if (/连不上|连接|超时|not connected|尚未连接/i.test(error.message)) {
                try { client?.close(); } catch { /* ignore */ }
                client = null;
            }
            if (attempt === 1) break;
        }
    }
    throw new Error(`豆包作答失败：${lastError?.message || '未知原因'}`);
}

export async function providerStatus() {
    try {
        const current = await getClient();
        const status = await current.status();
        return {
            ok: !status.looksLoggedOut && status.hasEditor,
            loggedOut: status.looksLoggedOut,
            title: status.title,
            href: status.href,
        };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}
