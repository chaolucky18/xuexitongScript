function createVideoLineRecovery({root, core, isActive, onStatus, now = Date.now}) {
    const COOLDOWN_MS = 12000;
    let context = '';
    let attempted = new Set();
    let lastAttemptAt = 0;
    let baseSource = null;
    let hadFailure = false;

    const locationKey = () => {
        const url = new URL(root.defaultView.location.href);
        return [url.origin, url.pathname, ...['courseId', 'clazzid', 'chapterId']
            .map(name => url.searchParams.get(name) || '')].join('|');
    };
    function reset() {
        context = locationKey();
        attempted = new Set();
        lastAttemptAt = 0;
        baseSource = null;
        hadFailure = false;
    }
    function currentSource(player) {
        try {
            const grouped = player.getGroupedSrc?.();
            const candidates = [
                ...(grouped?.label?.['高清'] || []),
                ...(grouped?.res?.['360'] || []),
                player.currentSource?.(),
                player.currentSources?.()[0],
            ].filter(source => source?.src);
            return candidates.find(source => {
                try {
                    return /(?:^|\.)cldisk\.com$|(?:^|\.)ananas\.chaoxing\.com$/i
                        .test(new URL(source.src).hostname);
                } catch (_) {
                    return false;
                }
            }) || candidates[0] || null;
        } catch (_) {
            return null;
        }
    }
    function sourceForLine(source, line, protocol) {
        if (!source?.src || !line) return null;
        const domainSuffix = source.src.slice(source.src.indexOf('.'));
        let src = source.src;
        if (typeof line.prefix === 'string' && line.prefix) {
            src = `${protocol}//${line.prefix}${domainSuffix}`;
        } else if (line.url) {
            const host = line.url.replace(/^https?:\/\//i, '');
            const base = `${protocol}//${host}`;
            const path = domainSuffix.slice(domainSuffix.indexOf('/'));
            src = `${base}/s1.ananas.chaoxing.com${path}`;
        }
        return {...source, src};
    }
    function lineIndex(lines, source, player) {
        let host = '';
        try { host = new URL(source?.src || '').hostname.toLowerCase(); } catch (_) {}
        let index = lines.findIndex(line => {
            if (line.prefix && host.startsWith(`${line.prefix}.`)) return true;
            if (line.url) {
                try {
                    const lineHost = new URL(/^https?:\/\//i.test(line.url)
                        ? line.url : `http://${line.url}`).hostname.toLowerCase();
                    if (host === lineHost || source?.src.includes('/s1.ananas.chaoxing.com/')) return true;
                } catch (_) {}
            }
            return false;
        });
        if (index >= 0) return index;
        try {
            const label = player.currentPlayline?.()?.label;
            index = lines.findIndex(line => line.label === label);
        } catch (_) {}
        return index;
    }
    function locate() {
        for (const doc of core.documents(root)) {
            const player = doc.defaultView?.videojs?.players?.video;
            if (!player) continue;
            const buttons = [...doc.querySelectorAll('input[name="ans-vjserrdisplay-opt"]')];
            const video = doc.querySelector('video#video_html5_api, video[id*="video_html5"]');
            const errorModal = [...doc.querySelectorAll('.ans-vjserrdisplay')]
                .find(element => !element.closest('.vjs-hidden,[hidden]') && core.visible(element));
            // Keep observing healthy media after the player removes its error UI.
            if (video || errorModal) {
                return {doc, player, buttons, video, errorModal};
            }
        }
        return null;
    }
    function buttonLabel(button) {
        return String(button.labels?.[0]?.innerText || button.labels?.[0]?.textContent ||
            button.parentElement?.innerText || button.parentElement?.textContent || '').trim();
    }
    function observe() {
        if (!isActive()) return false;
        const currentContext = locationKey();
        if (currentContext !== context) reset();
        const found = locate();
        if (!found) return false;
        const {player, buttons, video, errorModal} = found;
        const playing = Boolean(video && !video.error && !video.paused && video.readyState >= 2);
        // Current media readiness takes precedence over a retained error panel.
        if (playing) {
            const recovered = hadFailure || attempted.size > 0;
            if (recovered) onStatus('视频已恢复播放。');
            reset();
            return recovered;
        }
        const failed = Boolean(video?.error) || Boolean(errorModal);
        if (!failed) {
            // player.src() clears media errors before the replacement source loads.
            // Keep the selected line and attempts until media is actually ready.
            if (attempted.size) return true;
            return false;
        }
        hadFailure = true;
        if (lastAttemptAt && now() - lastAttemptAt < COOLDOWN_MS) return true;
        const lines = player.options_?.playlines || [];
        if (!lines.length) {
            onStatus('视频播放失败，但播放器没有提供可切换线路。');
            return false;
        }
        const source = currentSource(player);
        const current = lineIndex(lines, source, player);
        if (current >= 0) attempted.add(lines[current].net || lines[current].label);
        try {
            const selected = player.currentPlayline?.()?.label;
            const selectedIndex = lines.findIndex(line => line.label === selected);
            if (selectedIndex >= 0) {
                attempted.add(lines[selectedIndex].net || lines[selectedIndex].label);
            }
        } catch (_) {}
        baseSource ||= source;
        const available = new Map(buttons.map(button => [buttonLabel(button), !button.disabled]));
        let target = null;
        let targetIndex = -1;
        for (let offset = 1; offset <= lines.length; offset++) {
            targetIndex = (Math.max(current, -1) + offset + lines.length) % lines.length;
            const line = lines[targetIndex];
            const net = line.net || line.label;
            if (attempted.has(net) || available.get(line.label) === false) continue;
            target = line;
            break;
        }
        if (!target) {
            onStatus('视频播放失败，所有可用线路都已尝试；请检查网络或稍后手动重试。');
            return false;
        }
        attempted.add(target.net || target.label);
        lastAttemptAt = now();
        let protocol = found.doc.defaultView.location.protocol;
        try { protocol = new URL(source.src).protocol; } catch (_) {}
        const nextSource = sourceForLine(baseSource, target, protocol);
        if (!nextSource || nextSource.src === baseSource?.src) {
            onStatus(`播放失败，无法生成“${target.label}”线路地址。`);
            return false;
        }
        const button = buttons.find(item => buttonLabel(item) === target.label);
        onStatus(`视频播放失败，正在自动切换“${target.label}”线路…`);
        if (button) button.checked = true;
        try {
            if (typeof player.selectCDN === 'function') {
                player.selectCDN(targetIndex);
            } else {
                player.src(nextSource);
            }
            const playing = player.play?.();
            if (playing?.catch) playing.catch(() => {});
            return true;
        } catch (error) {
            try {
                player.src(nextSource);
                const playing = player.play?.();
                if (playing?.catch) playing.catch(() => {});
                return true;
            } catch (fallbackError) {
                onStatus(`线路“${target.label}”启动失败：${fallbackError.message}`);
                return false;
            }
        }
    }
    reset();
    return {observe, reset, sourceForLine};
}

createVideoLineRecovery.sourceForLine = function sourceForLine(source, line, protocol) {
    const fakeRoot = {
        defaultView: {
            location: {href: 'https://mooc1.chaoxing.com/mycourse/studentstudy'},
        },
    };
    return createVideoLineRecovery({
        root: fakeRoot,
        core: {documents: () => []},
        isActive: () => false,
        onStatus: () => {},
    }).sourceForLine(source, line, protocol);
};

module.exports = createVideoLineRecovery;
