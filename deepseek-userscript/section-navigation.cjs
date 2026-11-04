// Keep a fixed destination until the URL and its video actually arrive.
function createSectionNavigation({root, core, isActive, onStatus, onVideo, onFallback, now = Date.now}) {
    let pending = null;
    const locationKey = () => {
        const u = new URL(root.defaultView.location.href);
        return [u.origin, u.pathname, ...['courseId', 'clazzid', 'chapterId'].map(k => u.searchParams.get(k) || '')].join('|');
    };
    const chapterId = () => new URL(root.defaultView.location.href).searchParams.get('chapterId');
    function reset() { pending = null; }
    function attempt() {
        const p = pending;
        if (!p || !isActive() || locationKey() !== p.from) return;
        p.attempts++; p.last = now();
        const target = p.targetId ? root.getElementById(p.targetId)?.querySelector('.posCatalog_name') : p.target;
        if (target?.isConnected) target.click();
        onStatus(`测验已完成，正在进入下一小节（${p.attempts}/3）…`);
    }
    function start({supersedeArrived = false} = {}) {
        if (!isActive()) return;
        if (pending?.arrived && supersedeArrived) reset();
        if (pending) return;
        const nodes = [...root.querySelectorAll('#coursetree .posCatalog_select:not(.firstLayer)')]
            .filter(el => el.querySelector('.posCatalog_name') && !el.querySelector('.posCatalog_select'))
            // Chaoxing puts a group's UL next to its heading, inside the same LI.
            .filter(el => !el.nextElementSibling?.matches('ul') ||
                !el.nextElementSibling.querySelector('.posCatalog_select'));
        const index = nodes.findIndex(el => el.id === `cur${chapterId()}`) >= 0
            ? nodes.findIndex(el => el.id === `cur${chapterId()}`)
            : nodes.findIndex(el => el.classList.contains('posCatalog_active'));
        if (index < 0 || !nodes[index + 1]) {
            // The original player handles course-end and unsupported directory layouts.
            onFallback?.(); return;
        }
        const node = nodes[index + 1];
        pending = {from:locationKey(), destination:node.id?.replace(/^cur/, '') || null,
            targetId:node.id, target:node.querySelector('.posCatalog_name'), attempts:0, last:0,
            arrived:0, plays:0, playAt:0};
        attempt();
    }
    function observe() {
        if (!pending) return false;
        if (!isActive()) { reset(); return false; }
        const p = pending;
        if (p.arrived && locationKey() === p.from) { reset(); return false; }
        if (locationKey() !== p.from) {
            if (p.destination && chapterId() !== p.destination) { reset(); return false; }
            if (!p.arrived) p.arrived = now() || 1;
            const video = core.documents(root).flatMap(doc => [...doc.querySelectorAll('video')]).find(core.visible);
            if (video && !video.paused && p.plays) { reset(); return false; }
            if (video && p.plays < 3 && (!p.plays || now() - p.playAt >= 8000)) {
                p.plays++; p.playAt = now(); onVideo();
                onStatus('已进入下一小节，正在启动视频…');
            }
            if (now() - p.arrived >= 120000) {
                onStatus('下一小节视频加载或播放超时，请检查页面后重新启动脚本。'); reset();
            }
            return true;
        }
        if (now() - p.last >= 8000) {
            if (p.attempts < 3) attempt();
            else { onStatus('测验已完成，但下一小节未打开；请检查页面提示，或手动点击下一节。'); reset(); }
        }
        return true;
    }
    return {start, observe, reset};
}
module.exports = createSectionNavigation;
