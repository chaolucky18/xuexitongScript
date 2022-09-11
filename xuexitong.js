
// 当前小节
window.unitCount = $(".ncells h4").index($(".currents")) + 1;
// 获取小节数量
window.unit = $(".ncells h4").length;

function main(){
    const frameObj = $("iframe").eq(0).contents().find("iframe.ans-insertvideo-online");
    const videoNum = frameObj.length;
    if(videoNum > 0){
        console.log("%c当前小节中包含 " + videoNum + " 个视频","color:#FF7A38;font-size:18px");
        var v_done = 0;
        // 添加事件处理程序
        addEventListener("playdone" ,()=>{
            v_done++;
            if(v_done > videoNum){
                // 下一节
            } else if(v_done < videoNum){
                watchVideo(frameObj, v_done)
            } else {
                console.log("%c本小节视频播放完毕，等待跳转至下一小节...","font-size:18px");nextUnit();
            }
        });
        // 播放
        watchVideo(frameObj, v_done);
    } else {
        if(window.unitCount < window.unit){
            console.log("%c当前小节中无视频，6秒后将跳转至下一节","font-size:18px");
            nextUnit();
        } else {
            console.log("%c好了好了，毕业了","color:red;font-size:18px");
        }
    }
}
function watchVideo(frameObj, v_done){
    // 添加播放事件
    var playDoneEvent = new Event("playdone");
    // 获取播放对象
    var v = undefined;
    v = frameObj.contents().eq(v_done).find("video#video_html5_api").get(0);window.a = v;
    // 设置倍速
    try{ v.playbackRate = 8;}
    catch(e){console.error("倍速设置失败！此节可能有需要回复内容，不影响，跳至下一节。错误信息："+e); nextUnit(); return;}
    // 播放
    v.play();
    console.log("%c正在 " + v.playbackRate + " 倍速播放第 " + (v_done + 1) + " 个视频","font-size:18px");
    // 循环获取播放进度
    window.inter = setInterval(()=>{
        v = window.a;
        if(v.currentTime >= v.duration){
            dispatchEvent(playDoneEvent);
            clearInterval(window.inter);
        }
        if(v.paused){
            v.play();
        }
    },1000);
}
function nextUnit(){
    console.log("%c即将进入下一节...","color:red;font-size:18px");
    setTimeout(() => {
        $(document).scrollTop($(document).height()-$(window).height());
        $(".orientationright").click();
        console.log("%c行了别看了，我知道你学会了，下一节","color:red;font-size:18px");// (已经跳转" +(++window.unitCount)+"次)");
        if(window.unitCount++ < window.unit){ setTimeout(() => main(), 10000) }
    }, 6000);
}
console.log("%c 欢迎使用本脚本，此科目有%c %d %c个小节，当前为 %c第%d小节 %c-chao", "color:#6dbcff", "color:red", window.unit, "color:#6dbcff", "color:red", window.unitCount, "font-size:8px");
main();
