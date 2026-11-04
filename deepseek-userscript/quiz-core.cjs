function createQuizCore() {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const kindPattern = /单选题|多选题|判断题/;
    const inputs = 'input[type="radio"],input[type="checkbox"]';
    const text = el => clean(el.innerText || el.textContent);
    function visible(el) {
        if (!el || !el.isConnected) return false;
        for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
            const style = node.ownerDocument.defaultView.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' || node.hidden) return false;
        }
        return el.getClientRects().length > 0;
    }
    function documents(root) {
        const result = [];
        let chapter;
        try { chapter = new URL(root.URL).searchParams.get('chapterId'); } catch (_) {}
        function visit(doc, depth) {
            if (!doc || !doc.body || depth > 3 || result.includes(doc)) return;
            if (depth && chapter) {
                try {
                    const params = new URL(doc.URL).searchParams;
                    const owner = params.get('knowledgeid') || params.get('knowledgeId') || params.get('chapterId');
                    if (owner && owner !== chapter) return;
                } catch (_) {}
            }
            result.push(doc);
            for (const frame of doc.querySelectorAll('iframe')) {
                if (!visible(frame)) continue;
                try { visit(frame.contentDocument, depth + 1); } catch (_) { /* cross origin */ }
            }
        }
        visit(root, 0);
        return result;
    }
    function optionForInput(input, index) {
        let element = input.labels?.[0] || input.closest('label') || input.parentElement;
        for (let i = 0; i < 4 && element; i++) {
            if (text(element).length > 1 && element.querySelectorAll(inputs).length === 1) break;
            const parent = element.parentElement;
            if (!parent || parent.querySelectorAll(inputs).length !== 1) break;
            element = parent;
        }
        if (!element || !visible(element)) return null;
        const raw = text(element);
        const letter = raw.match(/^([A-H])\s*[.、．:：]/)?.[1] || String.fromCharCode(65 + index);
        return { letter, text: clean(raw.replace(/^[A-H]\s*[.、．:：]\s*/, '')), element, input };
    }
    function titleFor(card, options) {
        const walker = card.ownerDocument.createTreeWalker(card, 4);
        const pieces = [];
        let node;
        while ((node = walker.nextNode())) {
            if (options.some(o => o.element.contains(node))) continue;
            if (node.parentElement.closest('button,a,input,script,style')) continue;
            pieces.push(node.textContent);
        }
        return clean(pieces.join(' ')).replace(/^[\d\s.、．]+/, '')
            .replace(/[【\[]?(单选题|多选题|判断题)[】\]]?/, '').trim();
    }
    function extractQuestions(root) {
        const questions = [];
        for (const doc of documents(root)) {
            const seen = new Set();
            for (const input of doc.querySelectorAll(inputs)) {
                let card = input.parentElement;
                for (let depth = 0; card && card !== doc.body && depth < 12; depth++, card = card.parentElement) {
                    if (!visible(card)) continue;
                    const all = [...card.querySelectorAll(inputs)];
                    if (all.length < 2 || all.length > 8) continue;
                    const kinds = text(card).match(/单选题|多选题|判断题/g) || [];
                    if (kinds.length !== 1) continue;
                    const options = all.map(optionForInput);
                    if (options.some(o => !o || !o.text)) continue;
                    if (seen.has(card)) break;
                    const title = titleFor(card, options);
                    if (!title || title.length > 500 || options.some(o => o.text.length > 500)) break;
                    seen.add(card);
                    questions.push({ kind: kinds[0], title, options, card, doc });
                    break;
                }
            }
            // Some chapter forms use clickable option rows instead of native inputs.
            const walker = doc.createTreeWalker(doc.body, 4);
            let node;
            while ((node = walker.nextNode())) {
                if (!kindPattern.test(node.textContent) || !visible(node.parentElement)) continue;
                let card = node.parentElement;
                for (let depth = 0; card && card !== doc.body && depth < 9; depth++, card = card.parentElement) {
                    if (card.querySelector(inputs) || seen.has(card)) break;
                    const kinds = text(card).match(/单选题|多选题|判断题/g) || [];
                    if (kinds.length > 1) break;
                    const labels = [...card.querySelectorAll('span,div,label,li,p,b,i,strong,a')]
                        .filter(el => /^[A-H]$/.test(text(el)) && ![...el.children].some(child => /^[A-H]$/.test(text(child))));
                    const options = [];
                    for (const label of labels) {
                        const letter = text(label);
                        if (options.some(o => o.letter === letter)) continue;
                        let element = label;
                        for (let up = 0; up < 5; up++) {
                            const parent = element.parentElement;
                            if (!parent || parent === card || labels.some(other => other !== label && parent.contains(other))) break;
                            element = parent;
                            if (text(element).length > 1) break;
                        }
                        const value = clean(text(element).replace(new RegExp(`^${letter}[.、．]?\\s*`), ''));
                        if (value && visible(element)) options.push({ letter, text: value, element, input: null });
                    }
                    if (options.length < 2 || options.length > 8) continue;
                    options.sort((a, b) => a.letter.localeCompare(b.letter));
                    const title = titleFor(card, options);
                    if (!title || title.length > 500 || options.some(o => o.text.length > 500)) break;
                    seen.add(card);
                    questions.push({ kind: kinds[0], title, options, card, doc });
                    break;
                }
            }
        }
        return questions;
    }
    function validateAnswers(questions, answers) {
        if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('AI 答案题量不匹配');
        const result = new Map();
        for (const answer of answers) {
            if (!Number.isInteger(answer.id) || result.has(answer.id) || !Array.isArray(answer.letters)) throw new Error('AI 答案题号错误或重复');
            const q = questions[answer.id - 1];
            if (!q) throw new Error('AI 返回未知题号');
            const letters = answer.letters.map(v => clean(v).toUpperCase());
            if (!letters.length || new Set(letters).size !== letters.length) throw new Error('AI 答案为空或包含重复选项');
            if (q.kind !== '多选题' && letters.length !== 1) throw new Error('单选或判断题必须只有一个答案');
            if (letters.some(letter => !q.options.some(o => o.letter === letter))) throw new Error('AI 返回不存在的选项');
            result.set(answer.id, letters);
        }
        return result;
    }
    function applyAnswers(questions, answers) {
        const validated = validateAnswers(questions, answers);
        if (questions.some(q => !q.card.isConnected || q.options.some(o => !o.element.isConnected))) throw new Error('页面题目已发生变化，请重新识别');
        questions.forEach((q, index) => {
            const desired = validated.get(index + 1);
            for (const option of q.options) {
                const checked = option.input?.checked || option.element.getAttribute('aria-checked') === 'true' || /(?:^|\s)(?:check_answer|active|checked|selected)(?:\s|$)/.test(option.element.className);
                const shouldCheck = desired.includes(option.letter);
                if (option.input?.type === 'radio' && !shouldCheck) continue;
                const before = option.element.outerHTML;
                if (Boolean(checked) !== shouldCheck) (option.input || option.element).click();
                if (option.input && Boolean(option.input.checked) !== shouldCheck) throw new Error('选项未确认选中，请手动核对');
                if (!option.input && shouldCheck && !checked && before === option.element.outerHTML) throw new Error('页面未确认选项变化，已停止自动提交');
            }
            q._filledLetters = desired.join('');
            q._filledMarkup = q.options.map(o => o.element.outerHTML);
        });
    }
    function verifyFilled(questions, answers) {
        const validated = validateAnswers(questions, answers);
        questions.forEach((q, i) => {
            const desired = validated.get(i + 1);
            if (q._filledLetters !== desired.join('') || !q.card.isConnected) throw new Error('填答状态已变化，停止自动提交');
            q.options.forEach((o, index) => {
                if (o.input ? Boolean(o.input.checked) !== desired.includes(o.letter) : o.element.outerHTML !== q._filledMarkup[index])
                    throw new Error('选项状态未确认，停止自动提交');
            });
        });
    }
    return { clean, visible, documents, extractQuestions, validateAnswers, applyAnswers, verifyFilled };
}
module.exports = createQuizCore();
