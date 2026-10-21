// 隔离世界（ISOLATED）里的桥接：把页面主世界的请求转发给扩展后台。
// 页面主世界（MAIN）拿不到 chrome.* API，扩展后台又够不到页面 DOM，
// 这两头就靠 postMessage 接起来。
document.documentElement.dataset.xxthBridge = '1';

window.addEventListener('message', (event) => {
    // 只信任同源页面发来的消息。source 在不同世界（隔离世界/主世界）里可能拿不到
    // 同一个 window 引用，所以 source 为空时放行、非空时必须就是本窗口。
    if (event.source && event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.__xxth !== 'request') return;
    const { id, op, payload } = data;
    chrome.runtime.sendMessage({ __xxth: 'service', op, payload })
        .then((result) => {
            if (!result) throw new Error('扩展后台没有响应，请重新加载页面');
            reply(id, result.ok, result.data, result.error);
        })
        .catch((error) => reply(id, false, null, error?.message || String(error)));
});

function reply(id, ok, data, error) {
    window.postMessage({ __xxth: 'reply', id, ok, data, error }, location.origin);
}