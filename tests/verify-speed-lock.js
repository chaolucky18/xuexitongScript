const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "chrome-extension", "v3_optimized.user.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(/playbackRate:\s*1\b/.test(script), "default playbackRate must be 1");
assert(script.includes("_applyPlaybackRate"), "script must centralize playback-rate enforcement");
assert(script.includes("ratechange"), "script must listen for player rate changes");
assert(/_applyPlaybackRate\(video\)/.test(script), "monitoring loop must re-apply the configured playback rate");
assert(manifest.version === "3.2.0.9", "extension version must be bumped so Chrome shows the updated build");

console.log("speed lock checks passed");
