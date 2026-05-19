const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "chrome-extension", "v3_optimized.user.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.version === "3.2.0.9", "extension version must be bumped for dialog throttling");
assert(script.includes("_lastTaskPointDialogClickAt"), "dialog handler must track last click time");
assert(script.includes("_isLikelyVisibleDialog"), "dialog handler must filter to likely modal layers");
assert(script.includes("taskDialogClickCooldownMs"), "dialog handler must use a click cooldown");
assert(!script.includes("$('body *:visible').filter"), "dialog handler must not scan every visible body descendant");
assert(script.includes("Math.max") && script.includes("zIndex"), "dialog filtering must consider stacking context");

console.log("dialog throttle checks passed");
