const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "chrome-extension", "v3_optimized.user.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.version === "3.2.0.9", "extension version must be bumped for video completion skip");
assert(script.includes("_isVideoFrameTaskComplete"), "script must detect completion for an individual video frame");
assert(script.includes("_getNextPendingVideoTaskIndex"), "script must find the next unfinished video task");
assert(script.includes("_areAllVideoTasksComplete"), "script must detect when all video tasks in the section are complete");
assert(/_getVideoEl\(\)[\s\S]*?_getNextPendingVideoTaskIndex\(frameObj,\s*this\._currentVideoTaskIndex\)/.test(script), "video lookup must skip completed frames before selecting a video element");
assert(/play\(\)[\s\S]*?const videoFrames = this\._getVideoFrames\(\);[\s\S]*?_areAllVideoTasksComplete\(videoFrames\)[\s\S]*?this\.nextUnit\(\)/.test(script), "play() must go to the next section when all video tasks are already complete");
assert(/_handleVideoTaskEnded\(\)[\s\S]*?_getNextPendingVideoTaskIndex\(frames,\s*this\._currentVideoTaskIndex \+ 1\)/.test(script), "video-ended flow must skip completed remaining video tasks");
assert(script.includes("\\u4efb\\u52a1\\u70b9\\u5df2\\u5b8c\\u6210"), "video completion detection must include task-point complete text");
assert(script.includes("\\u5f85\\u5b8c\\u6210") && script.includes("\\u672a\\u5b8c\\u6210"), "video completion detection must avoid skipping incomplete task markers");

console.log("video completion skip checks passed");
