function createSubmissionHelper({ root, core, isEnabled, onStatus }) {
    const attempted = new Set();
    const sleep = ms => new Promise(resolve => root.defaultView.setTimeout(resolve, ms));
    function findButton(scope, label) {
        return [...scope.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"]')]
            .find(el => core.visible(el) && core.clean(el.value || el.innerText || el.textContent) === label);
    }
    function completionKind() {
        for (const doc of core.documents(root)) {
            const text = core.clean(doc.body?.innerText || doc.body?.textContent);
            if (/本次成绩\s*\d+(?:\.\d+)?\s*分/.test(text) && /我的答案|已完成|章节测验/.test(text)) {
                return 'chapter';
            }
            let path = doc.location?.pathname || '';
            try { path = new URL(doc.URL).pathname || path; } catch (_) {}
            if ((/\/work\/selectWorkQuestion/.test(path) || /任务点已完成/.test(text)) &&
                /作业|章节测验/.test(text) && /已完成|已批阅/.test(text) && /我的答案/.test(text)) {
                return 'assignment';
            }
        }
        return '';
    }
    const completed = () => Boolean(completionKind());
    async function submit(questions, answers, key, isCurrent = () => true) {
        const enabled = () => isEnabled() && isCurrent();
        if (!enabled()) return null;
        const initialCompletion = completionKind();
        if (initialCompletion) return initialCompletion;
        if (attempted.has(key)) throw new Error('本次题目已尝试提交，请核对平台结果，避免重复提交');
        if (!questions.length || new Set(questions.map(q => q.doc)).size !== 1) throw new Error('题目不完整或跨多个框架，停止自动提交');
        const doc = questions[0].doc;
        const expected = core.clean(doc.body.innerText || doc.body.textContent).match(/题量\s*[:：]\s*(\d+)/);
        if (expected && Number(expected[1]) !== questions.length) throw new Error('识别题量与页面不一致，停止自动提交');
        await sleep(150);
        core.verifyFilled(questions, answers);
        if (!enabled()) return null;
        const button = findButton(doc, '提交');
        if (!button || button.disabled) throw new Error('未找到可用的提交按钮，请手动处理');
        const locationKey = root.defaultView.location.href;
        const inline = Boolean(doc.querySelector('video'));
        attempted.add(key);
        button.scrollIntoView?.({ block: 'center' });
        onStatus('答案校验通过，正在提交并等待平台结果…');
        button.click();
        const confirmed = new WeakSet();
        for (let attempt = 0; attempt < 240; attempt++) {
            if (!enabled()) throw new Error('自动提交已关闭或章节已切换，请核对本次结果');
            if (root.defaultView.location.href !== locationKey) throw new Error('章节已经切换，停止本次提交确认');
            const completion = completionKind();
            if (completion) return completion;
            const docs = core.documents(root);
            for (const current of docs) {
                const pop = current.querySelector('#popok');
                if (core.visible(pop) && !confirmed.has(pop)) {
                    const message = core.clean(current.querySelector('#popcontent')?.textContent);
                    if (/未作答|未完成|请选择|请作答|答完/.test(message)) throw new Error(`平台拒绝提交：${message}`);
                    if (!/提交|交卷/.test(message)) continue;
                    confirmed.add(pop); pop.click();
                }
                for (const dialog of current.querySelectorAll('[role="dialog"],[role="alertdialog"],.layui-layer-dialog,.el-message-box,.modal')) {
                    const message = core.clean(dialog.textContent);
                    if (!core.visible(dialog) || !/提交|交卷/.test(message)) continue;
                    if (/未作答|未完成|请选择|请作答|答完/.test(message)) throw new Error(`平台拒绝提交：${message}`);
                    const confirm = findButton(dialog, '确定') || findButton(dialog, '确认') || findButton(dialog, '提交');
                    if (!confirm || confirmed.has(confirm)) continue;
                    confirmed.add(confirm); confirm.click();
                }
            }
            if (inline && !core.extractQuestions(root).length) return 'inline';
            await sleep(500);
        }
        throw new Error('等待 120 秒仍未确认提交成功，请查看平台结果；不会重复提交');
    }
    return { submit, completed, completionKind };
}
module.exports = createSubmissionHelper;
