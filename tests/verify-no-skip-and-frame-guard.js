const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "chrome-extension", "v3_optimized.user.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.version === "3.2.0.9", "extension version must be bumped for no-skip/frame-guard fix");
assert(script.includes("\\u53bb\\u5b66\\u4e60"), "unfinished-task dialog must target the go-study button");
assert(script.includes("\\u53bb\\u5b8c\\u6210"), "unfinished-task dialog must also target go-complete wording");
assert(!script.includes("closing unfinished-task dialog via next section"), "unfinished-task dialog must not click next section");
assert(script.includes("return true;") && script.includes("native unfinished-task confirm handled as go study"), "native confirm must choose go-study instead of next-section");
assert(script.includes("_findVideoFramesInWindow"), "video frame discovery must recurse safely");
assert(script.includes("SecurityError") && script.includes("return;"), "cross-origin iframe access must be ignored without console errors");
assert(!script.includes("get video frames failed:"), "expected cross-origin iframe access must not be logged as a hard error");

console.log("no-skip and frame-guard checks passed");
