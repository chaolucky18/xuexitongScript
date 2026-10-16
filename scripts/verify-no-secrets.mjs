import { readFileSync } from "node:fs";

for (const f of [
    "v1_autoAnswer.js",
    "v1_autoAnswer_optimized.js",
    "v1_autoAnswer_optimized.user.js",
    "scripts/build-v1-optimized.mjs",
]) {
    const t = readFileSync(f, "utf8");
    console.log(f, {
        hasSecret: /sk-[a-z0-9]{10,}/i.test(t),
        apiKeyEmpty: /apiKey:\s*""/.test(t),
    });
}
