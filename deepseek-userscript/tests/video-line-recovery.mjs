import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';

const require = createRequire(import.meta.url);
const createRecovery = require('../video-line-recovery.cjs');

const source = {
    src: 'https://s2.cldisk.com/sv-s1/video/34/example/sd.mp4?token=test',
    type: 'video/mp4',
    res: 360,
};
const lines = [
    {label: '公网1', net: 'p1', prefix: 's2'},
    {label: '公网2', net: 'p2', prefix: 's1'},
    {label: '本校', net: 's0', url: 'http://219.231.0.15'},
];

function setup() {
    const dom = new JSDOM(`
        <iframe id="cards"></iframe>
        <div id="line-error">
            <p>视频因格式不支持或者服务器或网络的问题无法加载。</p>
            <label><input type="radio" name="ans-vjserrdisplay-opt" disabled>公网1</label>
            <label><input type="radio" name="ans-vjserrdisplay-opt">公网2</label>
            <label><input type="radio" name="ans-vjserrdisplay-opt">本校</label>
        </div>
    `, {url: 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=101', runScripts: 'outside-only'});
    const window = dom.window;
    const cards = window.document.querySelector('#cards').contentDocument;
    cards.body.innerHTML = `
        <video id="video_html5_api"></video>
        <div class="vjs-error-display vjs-modal-dialog">
            <p>无法播放媒体。</p>
            <label><input type="radio" name="ans-vjserrdisplay-opt" disabled>公网1</label>
            <label><input type="radio" name="ans-vjserrdisplay-opt">公网2</label>
            <label><input type="radio" name="ans-vjserrdisplay-opt">本校</label>
        </div>
    `;
    cards.defaultView.Element.prototype.getClientRects = () => [{width: 100, height: 20}];
    const video = cards.querySelector('video');
    video.error = {code: 4, message: 'PIPELINE_ERROR_READ'};
    Object.defineProperty(video, 'paused', {get: () => true, configurable: true});
    const player = {
        currentSource: () => source,
        currentSources: () => [source],
        currentPlayline: () => lines[0],
        options_: {playlines: lines},
        getGroupedSrc: () => ({label: {'高清': [source]}}),
        newSource: null,
        selected: null,
        selectCDN(index) {
            this.selected = index;
            const selected = lines[index];
            const parsed = new URL(source.src);
            this.newSource = selected.prefix
                ? {...source, src: source.src.replace('s2.cldisk.com', `${selected.prefix}.cldisk.com`)}
                : {...source, src: `https://219.231.0.15/s1.ananas.chaoxing.com${parsed.pathname}${parsed.search}`};
            video.error = null;
            return this;
        },
        src(next) {
            this.newSource = next;
            video.error = null;
            return this;
        },
        play() {
            return Promise.resolve();
        },
    };
    cards.defaultView.videojs = {players: {video: player}};
    let status = '';
    let clock = 0;
    const core = {
        visible: element => Boolean(element?.isConnected &&
            !element.closest('.vjs-hidden,[hidden],[style*="display: none"]')),
        documents: () => [cards],
    };
    const recovery = createRecovery({
        root: window.document,
        core,
        isActive: () => true,
        onStatus: message => { status = message; },
        now: () => clock,
    });
    return {dom, recovery, player, video, cards, status: () => status,
        advance: milliseconds => { clock += milliseconds; }};
}

assert.equal(createRecovery.sourceForLine(source, lines[1], 'https:').src,
    'https://s1.cldisk.com/sv-s1/video/34/example/sd.mp4?token=test');
assert.equal(createRecovery.sourceForLine(source, lines[2], 'https:').src,
    'https://219.231.0.15/s1.ananas.chaoxing.com/sv-s1/video/34/example/sd.mp4?token=test');

{
    const page = setup();
    assert.equal(page.recovery.observe(), true);
    assert.equal(page.player.newSource.src,
        'https://s1.cldisk.com/sv-s1/video/34/example/sd.mp4?token=test',
        'A failed public line must switch to the next enabled public line');
    assert.equal(page.player.selected, 1, 'The native selectCDN path must be preferred');
    assert.match(page.status(), /公网2/);
    page.dom.window.close();
}

{
    const page = setup();
    page.recovery.observe();
    assert.equal(page.recovery.observe(), true,
        'A source briefly clearing video.error must not reset line attempts while it loads');
    page.video.error = {code: 4, message: 'still failing'};
    page.player.currentSource = () => page.player.newSource;
    page.advance(12000);
    assert.equal(page.recovery.observe(), true);
    assert.equal(page.player.newSource.src,
        'https://219.231.0.15/s1.ananas.chaoxing.com/sv-s1/video/34/example/sd.mp4?token=test',
        'A second media error must try the next available line');
    page.video.error = {code: 4, message: 'all lines failed'};
    page.player.currentSource = () => page.player.newSource;
    page.advance(12000);
    assert.equal(page.recovery.observe(), false, 'All lines must be attempted only once per section');
    assert.match(page.status(), /所有可用线路/);
    page.cards.querySelector('.vjs-error-display').insertAdjacentHTML('beforeend',
        '<div class="ans-vjserrdisplay">播放失败</div>');
    page.video.error = null;
    Object.defineProperty(page.video, 'paused', {get: () => false});
    Object.defineProperty(page.video, 'readyState', {value: 4});
    assert.equal(page.recovery.observe(), true);
    assert.match(page.status(), /视频已恢复播放/,
        'A manual recovery after exhausting lines must replace the failure message');
    page.dom.window.close();
}

{
    const page = setup();
    page.video.error = null;
    assert.equal(page.recovery.observe(), false);
    assert.equal(page.player.newSource, null, 'Healthy playback must not switch lines');
    page.dom.window.close();
}

{
    const page = setup();
    page.recovery.observe();
    page.video.error = null;
    Object.defineProperty(page.video, 'paused', {get: () => false});
    Object.defineProperty(page.video, 'readyState', {value: 4});
    assert.equal(page.recovery.observe(), true, 'Successful recovery must keep its status for one scan');
    assert.match(page.status(), /视频已恢复播放/);
    assert.equal(page.recovery.observe(), false);
    page.dom.window.close();
}

{
    const page = setup();
    delete page.player.selectCDN;
    page.recovery.observe();
    assert.equal(page.player.newSource.src,
        'https://s1.cldisk.com/sv-s1/video/34/example/sd.mp4?token=test',
        'A page without selectCDN must still use the verified source fallback');
    page.dom.window.close();
}

{
    const page = setup();
    const broken = {...source, src: 'https://s2.231.0.15/s1.ananas.chaoxing.com/bad.mp4'};
    page.player.currentSource = () => broken;
    page.video.error = {code: 4, message: 'bad historical source'};
    page.recovery.observe();
    assert.equal(page.player.newSource.src,
        'https://s1.cldisk.com/sv-s1/video/34/example/sd.mp4?token=test',
        'A previously malformed source must not be used as the next line template');
    page.dom.window.close();
}

{
    const page = setup();
    page.player.currentPlayline = () => lines[1];
    page.recovery.observe();
    assert.equal(page.player.selected, 2,
        'When the selected line is broken, its last media error must not be retried');
    page.dom.window.close();
}

{
    const page = setup();
    const modal = page.cards.querySelector('.vjs-error-display');
    modal.insertAdjacentHTML('beforeend', '<div class="ans-vjserrdisplay">播放失败</div>');
    page.video.error = null;
    modal.classList.add('vjs-hidden');
    assert.equal(page.recovery.observe(), false,
        'A hidden retained error node must not initiate line recovery');
    assert.equal(page.player.newSource, null);
    page.dom.window.close();
}

for (const removeModal of [false, true]) {
    const page = setup();
    const modal = page.cards.querySelector('.vjs-error-display');
    modal.insertAdjacentHTML('beforeend', '<div class="ans-vjserrdisplay">播放失败</div>');
    page.recovery.observe();
    if (removeModal) modal.remove();
    Object.defineProperty(page.video, 'paused', {get: () => false});
    Object.defineProperty(page.video, 'readyState', {value: 4});
    page.advance(12000);
    assert.equal(page.recovery.observe(), true,
        'Playable media must clear the failure even when the error node remains or is removed');
    assert.match(page.status(), /恢复播放/);
    assert.equal(page.player.selected, 1, 'Recovery must not switch away from playable media');
    assert.equal(page.recovery.observe(), false, 'The recovered state must be reported once');
    page.dom.window.close();
}

console.log('PASS: media errors rotate lines and recovered playback clears retained error UI');
