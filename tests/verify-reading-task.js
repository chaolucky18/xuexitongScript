const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "chrome-extension", "v3_optimized.user.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.version === "3.2.0.9", "extension version must be bumped for reading-task automation");
assert(script.includes("readingScrollInterval"), "reading automation must have an interval config");
assert(script.includes("_handleReadingTask"), "script must route non-video reading tasks before skipping");
assert(script.includes("_startReadingScroll"), "script must start a gradual reading scroll loop");
assert(script.includes("_getReadingScrollTargets"), "script must find scrollable document targets");
assert(script.includes("_isCurrentTaskPointComplete"), "script must detect task-point completion before nextUnit");
assert(script.includes("\\u4efb\\u52a1\\u70b9\\u5df2\\u5b8c\\u6210"), "completion detection must match task-point-complete text");
assert(script.includes("\\u6559\\u6750") && script.includes("\\u9605\\u8bfb") && script.includes("\\u6587\\u6863"), "reading task detection must include textbook/reading/document labels");
assert(/_handleReadingTask\(\)[\s\S]*?_advanceLearningStep\(\)/.test(script), "play() must handle reading before switching steps");
assert(/Math\.min\(max,\s*target\.getTop\(\)\s*\+\s*this\.configs\.readingScrollStepPx\)/.test(script), "reading loop must gradually move scrollTop down");
assert(/this\.nextUnit\(\)/.test(script.slice(script.indexOf("_isCurrentTaskPointComplete"))), "completion path must continue to next unit");

console.log("reading task checks passed");
