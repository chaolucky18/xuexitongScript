const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "chrome-extension", "v3_optimized.user.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.version === "3.2.0.9", "extension version must be bumped for task classification fixes");
assert(script.includes("_isQuizTaskPage"), "script must explicitly detect chapter quiz pages");
assert(script.includes("_getTaskKind"), "script must classify task pages before choosing video/reading/quiz behavior");
assert(script.includes("_hasVideoTaskSignal"), "script must treat video task markers as stronger evidence than reading labels");
assert(/_handleReadingTask\(\)[\s\S]*?_getTaskKind\(\)[\s\S]*?!== 'reading'/.test(script), "reading automation must only run for pages classified as reading");
assert(/_handleTaskPointDialog\(reason\)[\s\S]*?_isQuizTaskPage\(\)[\s\S]*?return true;/.test(script), "quiz unfinished-task dialogs must be consumed without clicking go-study repeatedly");
assert(!/if \(currentStepTitle === '.*'\s*\|\|\s*currentStepTitle === '.*'\)/.test(script), "task detection must not depend on mojibake literal titles");

console.log("task classification checks passed");
