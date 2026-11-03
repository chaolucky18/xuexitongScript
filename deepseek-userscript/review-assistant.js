(function () {
    if (window.top !== window || window.__xuexitongDeepSeekReview) return;
    const LOCAL_TOKEN = '__LOCAL_TOKEN__';
    const LOCAL_URL = 'http://127.0.0.1:37841';
    const core = createQuizCore();
    const state = { active: false, epoch: 0, waitingForReview: false, configured: false, busy: false, signature: '', attempted: new Set(), ready: null, completed: false };
    const requests = new Set();
    let scanTimer, healthTimer;
    window.__xuexitongDeepSeekReview = state;
    const panel = document.createElement('section');
    panel.id = 'xuexitong-deepseek-review-panel';
    panel.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;width:330px;max-height:55vh;overflow:auto;background:#fff;color:#17212b;border:1px solid #cbd5e1;border-radius:12px;padding:16px;box-shadow:0 8px 32px #0003;font:14px/1.6 system-ui';
    const title = document.createElement('strong');
    title.textContent = 'DeepSeek 答题助手';
    const stopButton = document.createElement('button');
    stopButton.id = 'xuexitong-script-stop';
    stopButton.textContent = '停止脚本';
    stopButton.style.cssText = 'float:right;border:0;border-radius:5px;padding:3px 8px;cursor:pointer';
    stopButton.addEventListener('click', () => { window.__xuexitongPlayerV3?.destroy(); stop(); });
    const startButton = document.createElement('button');
    startButton.id = 'xuexitong-script-start';
    startButton.textContent = '启动脚本';
    startButton.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:9px 16px;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer';
    startButton.addEventListener('click', () => { window.__xuexitongPlayerV3?.run(); });
    startButton.hidden = true;
    document.body.appendChild(startButton);
    const connection = document.createElement('div');
    connection.textContent = '正在连接本机服务…';
    const status = document.createElement('div');
    const result = document.createElement('div');
    const surveySettings = document.createElement('details');
    const surveySummary = document.createElement('summary');
    surveySummary.textContent = '问卷评分设置'; surveySettings.append(surveySummary);
    const surveyEnabled = document.createElement('input'); surveyEnabled.type = 'checkbox';
    const surveyEnabledLabel = document.createElement('label');
    surveyEnabledLabel.append(surveyEnabled, ' 自动填写本课程同类评价'); surveySettings.append(surveyEnabledLabel);
    const scoreInputs = ['知识量', '趣味性', '教师参与', '课程设计'].map(label => {
        const row = document.createElement('label'), select = document.createElement('select');
        for (let score = 1; score <= 5; score++) {
            const option = document.createElement('option'); option.value = String(score); option.textContent = `${score} 分`; select.append(option);
        }
        select.value = '5'; row.style.display = 'block'; row.append(label + ' ', select); surveySettings.append(row);
        return select;
    });
    const surveyCommentLabel = document.createElement('label'), surveyComment = document.createElement('textarea');
    surveyCommentLabel.textContent = '其他建议'; surveyCommentLabel.style.display = 'block';
    surveyComment.value = '暂无建议'; surveyComment.maxLength = 1000; surveyComment.style.width = '100%';
    surveyCommentLabel.append(surveyComment); surveySettings.append(surveyCommentLabel);
    const saveSurvey = document.createElement('button'); saveSurvey.textContent = '保存本课程问卷规则'; surveySettings.append(saveSurvey);
    function surveyRuleKey() {
        const params = new URL(location.href).searchParams;
        return 'xuexitong-survey-v1:' + ['courseId', 'clazzid', 'cpi'].map(name => params.get(name) || '').join(':');
    }
    function surveyRule() {
        try {
            const rule = JSON.parse(localStorage.getItem(surveyRuleKey()) || 'null');
            return rule?.enabled ? rule : null;
        } catch (_) { return null; }
    }
    const savedSurvey = surveyRule();
    if (savedSurvey) {
        surveyEnabled.checked = true;
        scoreInputs.forEach((input, i) => { input.value = String(savedSurvey.scores?.[i] || 5); });
        surveyComment.value = savedSurvey.comment || '';
    }
    saveSurvey.addEventListener('click', () => {
        if (!new URL(location.href).searchParams.get('courseId')) return;
        const rule = {enabled: surveyEnabled.checked, scores: scoreInputs.map(input => Number(input.value)), comment: surveyComment.value.trim()};
        if (rule.enabled && !rule.comment) { status.textContent = '请填写“其他建议”或关闭自动填写。'; return; }
        try { localStorage.setItem(surveyRuleKey(), JSON.stringify(rule)); }
        catch (_) { status.textContent = '无法保存问卷规则，请检查浏览器存储设置。'; return; }
        state.survey?.ruleChanged();
        status.textContent = rule.enabled ? '问卷规则已保存，仅用于本课程中题目和选项相同的章节评价。' : '问卷自动填写已关闭。';
        scan();
    });
    const setup = document.createElement('a');
    setup.href = `${LOCAL_URL}/`;
    setup.target = '_blank'; setup.rel = 'noopener'; setup.textContent = '打开本机配置页';
    setup.style.cssText = 'display:inline-block;margin:8px 0;color:#2563eb';
    const autoLabel = document.createElement('label');
    const auto = document.createElement('input'); auto.type = 'checkbox'; auto.checked = true;
    autoLabel.append(auto, document.createTextNode(' 自动识题作答'));
    const submitLabel = document.createElement('label');
    const autoSubmit = document.createElement('input'); autoSubmit.type = 'checkbox';
    autoSubmit.id = 'xuexitong-ai-auto-submit';
    try { autoSubmit.checked = localStorage.getItem('xuexitong-ai-auto-submit') !== 'false'; }
    catch (_) { autoSubmit.checked = true; }
    submitLabel.append(autoSubmit, document.createTextNode(' 答案校验后自动提交'));
    const button = document.createElement('button');
    button.textContent = '重新识别并作答';
    button.style.cssText = 'display:block;width:100%;padding:9px;margin-top:10px;border:0;border-radius:7px;background:#2563eb;color:white;cursor:pointer;font:inherit';
    panel.append(title, stopButton, connection, setup, document.createElement('br'), autoLabel, document.createElement('br'), submitLabel, surveySettings, status, result, button);
    panel.hidden = true;
    document.body.appendChild(panel);
    let submission;
    function clearChapter() {
        state.ready = null; state.signature = ''; state.completed = false;
        result.replaceChildren(); status.textContent = ''; state.waitingForReview = false;
        state.lineRecovery?.reset();
        state.survey?.reset();
    }
    const resumeVideo = () => {
        const app = window.__xuexitongPlayerV3;
        if (app) { app._nextUnitPending = false; app._tryTimes = 0; app._videoEl = null; app.play(); }
    };
    const navigation = typeof createSectionNavigation === 'function' ? createSectionNavigation({
        root: document, core, isActive: () => state.active,
        onStatus: message => { status.textContent = message; }, onVideo: resumeVideo,
        onFallback: () => window.__xuexitongPlayerV3?.nextUnit(),
    }) : null;
    const lineRecovery = typeof createVideoLineRecovery === 'function' ? createVideoLineRecovery({
        root: document, core, isActive: () => state.active,
        onStatus: message => { status.textContent = message; },
    }) : null;
    const flow = createLearningFlow({ root: document, core, isActive: () => state.active,
        onHold: () => { state.waitingForReview = true; holdPlayback(); },
        onRelease: () => { state.waitingForReview = false; },
        onEnter: clearChapter, onReset: clearChapter,
        onStatus: message => { status.textContent = message; },
        onNext: () => { if (navigation) { navigation.start(); return true; } window.__xuexitongPlayerV3?.nextUnit(); },
        onVideo: () => {
            const app = window.__xuexitongPlayerV3;
            if (app) { app._videoEl = null; app.play(); }
        },
    });
    state.findVideo = () => {
        const videos = core.documents(document).flatMap(doc =>
            [...doc.querySelectorAll('video#video_html5_api, video[id*="video_html5"]')]).filter(core.visible);
        return videos.find(video => video.readyState > 0) || videos[0] || null;
    };
    const survey = typeof createSurveyFlow === 'function' ? createSurveyFlow({
        root: document, core, isActive: () => state.active, getRule: surveyRule,
        isAutoSubmit: () => autoSubmit.checked,
        onHold: () => { state.waitingForReview = true; holdPlayback(); },
        onStatus: message => { status.textContent = message; },
        onComplete: () => { state.waitingForReview = false; if (navigation) navigation.start(); else window.__xuexitongPlayerV3?.nextUnit(); },
    }) : null;
    state.survey = survey;
    state.beforeNext = () => survey?.beforeNext() || flow.beforeNext();
    state.isSurveyPage = () => survey?.present() || false;
    state.isQuizPage = flow.isQuizPage; state.stepTitle = flow.stepTitle;
    state.lineRecovery = lineRecovery;
    state.recoverVideoLine = () => lineRecovery?.observe() || false;
    function start() {
        if (state.active) return;
        state.active = true; state.epoch++;
        navigation?.reset(); flow.reset(); lineRecovery?.reset(); clearChapter();
        const epoch = state.epoch;
        submission = createSubmissionHelper({ root: document, core,
            isEnabled: () => state.active && state.epoch === epoch && autoSubmit.checked,
            onStatus: message => { if (state.active && state.epoch === epoch) status.textContent = message; } });
        state.attempted.clear(); state.signature = ''; state.completed = false;
        panel.hidden = false; startButton.hidden = true;
        scan(); health();
        scanTimer = setInterval(scan, 1500);
        healthTimer = setInterval(health, 10000);
    }
    function stop() {
        state.active = false; state.epoch++;
        navigation?.reset(); flow.reset(); lineRecovery?.reset();
        clearInterval(scanTimer); clearInterval(healthTimer);
        for (const controller of requests) controller.abort();
        requests.clear();
        state.busy = false; state.ready = null; state.waitingForReview = false;
        button.disabled = false; result.replaceChildren(); status.textContent = '';
        panel.hidden = true; startButton.hidden = false;
    }
    state.start = start; state.stop = stop;
    function questionsNow() {
        return core.extractQuestions(document).filter(q => !panel.contains(q.card));
    }
    function signature(questions) {
        return JSON.stringify([flow.sectionKey(), questions.map(q => [q.kind, q.title, q.options.map(o => [o.letter, o.text])])]);
    }
    function holdPlayback() {
        const app = window.__xuexitongPlayerV3;
        if (app) { app._isPlaying = false; app._clearCheckInterval(); }
        for (const doc of core.documents(document)) for (const video of doc.querySelectorAll('video')) {
            if (!video.paused) video.pause();
        }
    }
    async function localRequest(path, options = {}) {
        const controller = new AbortController();
        requests.add(controller);
        try {
        const response = await fetch(`${LOCAL_URL}${path}`, { ...options,
            headers: { 'X-Xuexitong-Token': LOCAL_TOKEN, ...(options.headers || {}) },
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(path === '/answer' ? 135000 : 4000)]),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `本机服务 HTTP ${response.status}`);
        return data;
        } finally { requests.delete(controller); }
    }
    async function health() {
        if (!state.active) return;
        const epoch = state.epoch;
        try {
            const data = await localRequest('/health');
            if (!state.active || epoch !== state.epoch) return;
            state.configured = data.configured;
            connection.textContent = data.configured ? '已连接 DeepSeek · deepseek-flash' : '本机服务已连接，等待你输入 API Key';
            connection.style.color = data.configured ? '#047857' : '#92400e';
        } catch (_) {
            if (!state.active || epoch !== state.epoch) return;
            state.configured = false;
            connection.textContent = '本机服务未连接：请启动服务；如有提示，允许课程页访问本机网络';
            connection.style.color = '#b45309';
        }
        scan();
    }
    async function answer(questions, key) {
        if (!state.active || state.busy) return;
        const epoch = state.epoch;
        const chapter = flow.sectionKey();
        state.busy = true; state.attempted.add(key); button.disabled = true;
        status.textContent = `已识别 ${questions.length} 题，DeepSeek 正在作答…`;
        result.replaceChildren();
        try {
            const payload = questions.map((q, i) => ({ id: i + 1, type: q.kind, question: q.title,
                options: q.options.map(o => ({ letter: o.letter, text: o.text })) }));
            const data = await localRequest('/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questions: payload }) });
            if (!state.active || epoch !== state.epoch || chapter !== flow.sectionKey()) return;
            const current = questionsNow();
            if (signature(current) !== key) throw new Error('题目已经切换，未填入旧题答案');
            const validated = core.validateAnswers(current, data.answers);
            core.applyAnswers(current, data.answers);
            for (let i = 0; i < current.length; i++) {
                const row = document.createElement('p');
                row.style.margin = '6px 0';
                row.textContent = `第 ${i + 1} 题：${validated.get(i + 1).join('、')} · ${current[i].title}`;
                result.appendChild(row);
            }
            state.ready = { questions: current, answers: data.answers, key };
            if (autoSubmit.checked) await submitReady();
            else status.textContent = '答案已填入，请核对后点击课程页面的“提交”。';
        } catch (error) { if (state.active && epoch === state.epoch) status.textContent = `已停止：${error.message}`; }
        finally { if (epoch === state.epoch) { state.busy = false; button.disabled = false; } }
    }
    async function submitReady() {
        if (!state.active || !state.ready || !autoSubmit.checked) return;
        const epoch = state.epoch;
        const chapter = flow.sectionKey();
        const { questions, answers, key } = state.ready;
        if (signature(questionsNow()) !== key) throw new Error('题目已变化，停止自动提交');
        const outcome = await submission.submit(questions, answers, key,
            () => state.active && epoch === state.epoch && chapter === flow.sectionKey());
        if (!state.active || epoch !== state.epoch || chapter !== flow.sectionKey()) return;
        if (!outcome) return;
        state.ready = null;
        state.completed = true;
        state.waitingForReview = false;
        status.textContent = outcome === 'chapter' ? '平台已确认提交结果，继续下一节。' : '随堂题已提交，继续播放。';
        if (outcome === 'chapter') flow.completeQuiz();
        else window.__xuexitongPlayerV3?.play();
    }
    function scan() {
        if (!state.active) return;
        try {
            if (state.recoverVideoLine()) return;
            flow.sync();
            if (survey?.observe()) return;
        navigation?.observe();
            const questions = questionsNow();
            const completed = submission.completed();
            const waitingForQuiz = flow.observe({ completed, hasQuestions: questions.length > 0, busy: state.busy });
            if (completed) {
                state.waitingForReview = false;
                if (!state.busy && !waitingForQuiz) status.textContent = '当前测验已完成。';
                return;
            }
            if (!questions.length) {
                if (waitingForQuiz) return;
                if (state.waitingForReview && !state.busy) {
                    state.waitingForReview = false;
                    window.__xuexitongPlayerV3?.play();
                }
                if (!state.busy && !state.completed) status.textContent = '等待课程页出现题目。';
                return;
            }
            state.waitingForReview = true; holdPlayback();
            const key = signature(questions);
            if (state.signature !== key) {
                state.signature = key; state.ready = null; state.completed = false; result.replaceChildren();
                status.textContent = `已识别 ${questions.length} 题，等待 DeepSeek 连接。`;
            }
            if (questions.length > 30) { status.textContent = '题量超过 30，请分批手动处理。'; return; }
            if (state.configured && auto.checked && !state.busy && !state.attempted.has(key)) answer(questions, key);
        } catch (error) { status.textContent = `识题停止：${error.message}`; }
    }
    state.scan = scan;
    button.addEventListener('click', async () => {
        await health();
        if (!state.active || !state.configured || state.busy) return;
        if (submission.completed()) { status.textContent = '当前测验已完成，不再重复作答。'; return; }
        const questions = questionsNow();
        if (questions.length && questions.length <= 30) answer(questions, signature(questions));
    });
    auto.addEventListener('change', scan);
    autoSubmit.addEventListener('change', async () => {
        try { localStorage.setItem('xuexitong-ai-auto-submit', String(autoSubmit.checked)); } catch (_) {}
        if (!state.active || !autoSubmit.checked || !state.ready || state.busy) return;
        const epoch = state.epoch;
        state.busy = true; button.disabled = true;
        try { await submitReady(); } catch (error) { if (state.active && epoch === state.epoch) status.textContent = `已停止：${error.message}`; }
        finally { if (epoch === state.epoch) { state.busy = false; button.disabled = false; } }
    });
    window.addEventListener('pagehide', stop, { once: true });
    if (window.__xuexitongPlayerV3?._scriptRunning) start();
})();
