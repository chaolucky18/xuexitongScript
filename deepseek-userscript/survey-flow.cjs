function createSurveyFlow({root, core, isActive, getRule, isAutoSubmit, onHold, onStatus, onComplete, now = Date.now}) {
    const titles = ['知识量（课程内容是否充实，有价值）', '趣味性（教学过程是否有趣，吸引人）',
        '教师参与（教师是否积极参与交流和互动）', '课程设计（课程是否合理，形式丰富）'];
    const section = () => {
        const url = new URL(root.defaultView.location.href);
        return ['courseId', 'clazzid', 'cpi', 'chapterId'].map(name => url.searchParams.get(name) || '').join('|');
    };
    let context, phase, openedAt, submittedAt;
    function reset() { context = section(); phase = ''; openedAt = submittedAt = 0; }
    function entryNow() {
        return core.documents(root).find(doc => /\/ananas\/modules\/zt\/vote\//.test(doc.location?.pathname || ''));
    }
    function resultComplete(doc) {
        const path = doc?.location?.pathname || '';
        const text = core.clean(doc?.body?.innerText || doc?.body?.textContent || '');
        return /\/questionnaire\/studentQuestionChapter/.test(path) && /已交/.test(text) &&
            !doc.querySelector('#submitSuccess');
    }
    function taskDone(entry, doc) {
        try {
            if (entry?.defaultView?.checkJobFinish?.() === true) return true;
        } catch (_) {}
        return resultComplete(doc);
    }
    function questionnaire(entry) {
        const frame = root.querySelector('#voteIframe');
        if (!core.visible(frame)) return null;
        try {
            const expected = new URL(root.defaultView.location.href).searchParams.get('chapterId');
            const params = new URL(frame.getAttribute('src') || '', root.URL).searchParams;
            const owner = params.get('knowledgeid') || params.get('knowledgeId');
            if (owner && owner !== expected) return null;
            const openedFrom = root.defaultView.openVoteIframe;
            if (openedFrom && openedFrom !== entry.defaultView.frameElement) return null;
            return frame.contentDocument?.body ? frame.contentDocument : null;
        } catch (_) { return null; }
    }
    function button(doc, label) {
        return [...doc.querySelectorAll('a,button,[role="button"]')]
            .find(el => core.visible(el) && core.clean(el.textContent) === label);
    }
    function fields(doc, rule) {
        if (!rule || !Array.isArray(rule.scores) || rule.scores.length !== 4 ||
            !rule.scores.every(score => Number.isInteger(score) && score >= 1 && score <= 5) ||
            typeof rule.comment !== 'string' || !rule.comment.trim() || rule.comment.length > 1000) {
            throw new Error('请点击“问卷评分设置”配置本课程规则，或手动评价。');
        }
        const items = [...doc.querySelectorAll('.question-item')].filter(core.visible);
        if (items.length !== 5) throw new Error('问卷题型与评分规则不匹配，请手动处理。');
        const radios = titles.map((title, index) => {
            if (core.clean(items[index].querySelector('.topic-txt')?.textContent) !== title) {
                throw new Error('问卷题目与评分规则不匹配，请手动处理。');
            }
            const options = [...items[index].querySelectorAll('[role="radio"]')].filter(core.visible);
            const scoreOf = el => core.clean(el.querySelector('.option-text')?.textContent || el.textContent)
                .replace(/^[A-E][.、．]\s*/, '');
            if (options.length !== 5 || new Set(options.map(scoreOf)).size !== 5 ||
                options.some(el => !/^[1-5]分$/.test(scoreOf(el)))) {
                throw new Error('问卷评分选项不匹配，请手动处理。');
            }
            const target = options.find(el => scoreOf(el) === `${rule.scores[index]}分`);
            return {options, target};
        });
        if (core.clean(items[4].querySelector('.topic-txt')?.textContent) !== '其他建议') {
            throw new Error('问卷建议题不匹配，请手动处理。');
        }
        const comment = items[4].querySelector('textarea');
        if (!core.visible(comment) || comment.disabled || comment.readOnly) throw new Error('问卷建议框不可填写。');
        return {radios, comment};
    }
    const selected = el => el.getAttribute('aria-checked') === 'true' || el.querySelector('input')?.checked === true;
    function choose(el) {
        const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
        (input || el).click();
    }
    function complete(entry, doc) {
        phase = 'complete';
        if (doc) button(doc, '返回')?.click();
        onStatus('问卷已确认完成，继续下一小节。');
        onComplete();
    }
    function observe() {
        if (!isActive()) return false;
        if (section() !== context) reset();
        const entry = entryNow();
        if (!entry) return false;
        if (phase === 'complete') return false;
        const doc = questionnaire(entry);
        onHold();
        if (taskDone(entry, doc)) { complete(entry, doc); return true; }
        if (phase === 'failed') return true;
        if (!phase) {
            phase = 'opening'; openedAt = now();
            if (!doc) entry.querySelector('#render')?.click();
            onStatus('检测到课程评价问卷，正在打开问卷…');
            return true;
        }
        if (!doc?.querySelector('.question-item')) {
            if (now() - openedAt > 120000) {
                phase = 'failed'; onStatus('问卷加载超时，请手动打开问卷；不会跳过任务。');
            }
            return true;
        }
        if (phase === 'submitting') {
            if (now() - submittedAt > 120000) {
                phase = 'failed'; onStatus('问卷提交后仍未确认完成，请核对平台结果；不会重复提交或跳转。');
            }
            return true;
        }
        const rule = getRule();
        try {
            const {radios, comment} = fields(doc, rule);
            if (phase === 'opening') {
                if (radios.some(({options, target}) => options.some(el => selected(el) && el !== target)) ||
                    (comment.value.trim() && comment.value !== rule.comment)) {
                    throw new Error('问卷已有与你的规则不同的答案，请手动核对；未覆盖。');
                }
                for (const {target} of radios) if (!selected(target)) choose(target);
                const win = doc.defaultView;
                Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set.call(comment, rule.comment);
                comment.dispatchEvent(new win.Event('input', {bubbles: true}));
                comment.dispatchEvent(new win.Event('change', {bubbles: true}));
                phase = 'filled';
                onStatus('问卷已按本课程评分规则填入，正在校验选中状态…');
                return true;
            }
            if (radios.some(({options, target}) => !selected(target) || options.some(el => el !== target && selected(el))) ||
                comment.value !== rule.comment) throw new Error('问卷答案校验未通过，请手动核对。');
            if (!isAutoSubmit()) { onStatus('问卷已填入，请核对后手动提交。'); return true; }
            const submit = doc.querySelector('#submitSuccess');
            if (!core.visible(submit) || submit.disabled || submit.getAttribute('aria-disabled') === 'true') {
                throw new Error('未找到可用的问卷提交按钮，请手动处理。');
            }
            phase = 'submitting'; submittedAt = now();
            onStatus('问卷答案校验通过，正在提交并等待平台确认…');
            submit.click();
        } catch (error) { onStatus(error.message); }
        return true;
    }
    reset();
    return {observe, reset, resultComplete, beforeNext: observe,
        present: () => Boolean(entryNow()) && phase !== 'complete',
        ruleChanged: () => { if (phase !== 'submitting') reset(); }};
}
module.exports = createSurveyFlow;
