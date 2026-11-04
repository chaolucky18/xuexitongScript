function createLearningFlow({ root, core, isActive, onHold, onRelease, onEnter, onReset, onStatus, onNext, onVideo }) {
    const chapterKey = () => {
        const url = new URL(root.defaultView.location.href);
        return [url.origin, url.pathname, ...['courseId', 'clazzid', 'chapterId'].map(name => url.searchParams.get(name) || '')].join('|');
    };
    let key = chapterKey(), pending = false, approved = false, advanced = false, openedAt = 0, loaded = false, failed = false, returning = false;
    const tabs = () => [...root.querySelectorAll('.prev_white')].filter(core.visible);
    const label = el => core.clean(el.textContent).replace(/^\d+\s*/, '');
    const tabFor = name => tabs().find(el => label(el) === name);
    function stepTitle() {
        const current = tabs().find(el => el.parentElement?.classList.contains('active') || el.getAttribute('aria-selected') === 'true');
        if (current) return label(current);
        const fallback = root.querySelector('.prev_title');
        return core.clean(fallback?.title || fallback?.textContent);
    }
    function sync() {
        const next = chapterKey();
        if (next === key) return;
        key = next; pending = approved = advanced = loaded = failed = returning = false; openedAt = 0;
        onReset();
    }
    function beforeNext() {
        sync();
        if (!isActive()) return true;
        if (approved) { approved = false; return false; }
        if (advanced) return true;
        const quiz = tabFor('章节测验');
        if (!quiz) { advanced = true; return false; }
        if (!pending && !advanced) {
            pending = true; openedAt = Date.now();
            onEnter(); onHold(); onStatus('视频已结束，正在打开当前小节的章节测验…');
            if (stepTitle() !== '章节测验') quiz.click();
        }
        return true;
    }
    function completeQuiz() {
        sync();
        if (!isActive() || advanced) return;
        if (pending || !tabFor('章节测验')) {
            pending = false; approved = advanced = true;
            onRelease(); onStatus('当前小节测验已确认完成，进入下一小节。');
            if (onNext() === true) approved = false;
        } else if (!returning) {
            // A quiz opened manually before video end must not skip the video.
            const video = tabFor('视频');
            if (!video) return;
            returning = true; onRelease();
            onStatus('测验已完成，返回视频；视频结束后再进入下一小节。');
            video.click(); onVideo();
        }
    }
    function observe({ completed, hasQuestions, busy }) {
        sync();
        if (!isActive()) return false;
        const quizPage = stepTitle() === '章节测验';
        const reviewPage = quizPage || stepTitle() === '作业';
        if (pending || reviewPage) onHold();
        if (completed && (pending || reviewPage) && !busy) { completeQuiz(); return true; }
        if (pending) {
            loaded ||= hasQuestions || completed;
            if (!loaded && Date.now() - openedAt >= 120000) failed = true;
            if (!loaded) onStatus(failed ? '章节测验加载超时，已停留在当前小节，请检查页面；不会跳过测验。' : '等待当前小节的章节测验加载，不会跳到下一小节。');
            return true;
        }
        if (returning && !quizPage) returning = false;
        return quizPage;
    }
    function reset() {
        key = chapterKey(); pending = approved = advanced = loaded = failed = returning = false; openedAt = 0;
    }
    return { beforeNext, completeQuiz, observe, sync, reset, sectionKey: chapterKey, stepTitle,
        isQuizPage: () => ['章节测验', '作业'].includes(stepTitle()) };
}
module.exports = createLearningFlow;
