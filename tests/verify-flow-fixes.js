const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "chrome-extension", "v3_optimized.user.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(script.includes("_currentVideoTaskIndex"), "script must track the current video task within a lesson");
assert(script.includes("_getVideoFrames"), "script must enumerate all video task iframes");
assert(script.includes("_handleVideoTaskEnded"), "script must route video completion through multi-video handling");
assert(/_getNextPendingVideoTaskIndex\(frames,\s*this\._currentVideoTaskIndex \+ 1\)/.test(script), "script must advance to the next unfinished video before nextUnit");
assert(script.includes("_handleTaskPointDialog"), "script must handle unfinished-task-point dialogs");
assert(script.includes("\\u5f53\\u524d\\u7ae0\\u8282\\u8fd8\\u6709\\u4efb\\u52a1\\u70b9\\u672a\\u5b8c\\u6210"), "dialog handler must match the unfinished-task-point text");
assert(script.includes("\\u53bb\\u5b66\\u4e60"), "dialog handler must choose the go-study button");
assert(script.includes("window.confirm"), "script must guard native confirm dialogs with the same prompt");
assert(manifest.version === "3.2.0.9", "extension version must be bumped for the flow fix");

console.log("flow fix checks passed");
