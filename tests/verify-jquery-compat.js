const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "chrome-extension", "v3_optimized.user.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.version === "3.2.0.9", "extension version must be bumped for the jQuery compatibility fix");
assert(!script.includes(".addBack("), "script must not use jQuery.addBack because Xuexitong ships an older jQuery");
assert(script.includes("_getDialogButtonCandidates"), "dialog button matching must use a compatibility helper");
assert(script.includes("try {") && script.includes("dialog handling failed"), "dialog handling must fail closed instead of breaking playback");

console.log("jquery compatibility checks passed");
