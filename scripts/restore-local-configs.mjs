/**
 * 从 .local-configs.json 还原个人配置到源码，并重建 optimized / userscript。
 * 用法：node scripts/restore-local-configs.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const localPath = resolve(root, ".local-configs.json");

if (!existsSync(localPath)) {
    console.error("缺少 .local-configs.json，无法还原");
    process.exit(1);
}

const local = JSON.parse(readFileSync(localPath, "utf8"));

function replaceObjectLiteral(source, marker, obj) {
    const start = source.indexOf(marker);
    if (start < 0) throw new Error("marker not found: " + marker);
    const brace = source.indexOf("{", start);
    let depth = 0;
    let end = -1;
    for (let i = brace; i < source.length; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    if (end < 0) throw new Error("object end not found for " + marker);
    const body = Object.entries(obj)
        .map(([k, v]) => {
            const val = typeof v === "string" ? JSON.stringify(v) : String(v);
            return `        ${k}: ${val},`;
        })
        .join("\n");
    return source.slice(0, brace + 1) + "\n" + body + "\n    " + source.slice(end);
}

let v1 = readFileSync(resolve(root, "v1_autoAnswer.js"), "utf8");
v1 = replaceObjectLiteral(v1, "const configs = {", local.v1_autoAnswer);
writeFileSync(resolve(root, "v1_autoAnswer.js"), v1, "utf8");
console.log("restored v1_autoAnswer.js");

// build script embeds optimized defaults — update apiKey placeholder string there too
let build = readFileSync(resolve(root, "scripts/build-v1-optimized.mjs"), "utf8");
const opt = local.v1_autoAnswer_optimized;
const optBlock = `                autoAdvanceNoVideo: ${opt.autoAdvanceNoVideo},
                // 章节测验：skipChapterTest 优先于 autoAnswer
                skipChapterTest: ${opt.skipChapterTest},
                autoAnswer: ${opt.autoAnswer},
                apiKey: ${JSON.stringify(opt.apiKey)},
                model: ${JSON.stringify(opt.model)},
                autoSubmit: ${opt.autoSubmit},
                useAI: ${opt.useAI},
                autoRedo: ${opt.autoRedo},
                autoRedoTimes: ${opt.autoRedoTimes},
                clearBeforeSelect: ${opt.clearBeforeSelect},
                decodeFont: ${opt.decodeFont},
            },`;

build = build.replace(
    /autoAdvanceNoVideo: true,\s*\/\/ 章节测验：skipChapterTest 优先于 autoAnswer[\s\S]*?decodeFont: true,\s*\},/,
    optBlock
);
// also restore playbackRate in the injected block if present in v3 base — optimized rebuild takes playback from v3
writeFileSync(resolve(root, "scripts/build-v1-optimized.mjs"), build, "utf8");

const r1 = spawnSync(process.execPath, ["scripts/build-v1-optimized.mjs"], { cwd: root, encoding: "utf8" });
process.stdout.write(r1.stdout || "");
process.stderr.write(r1.stderr || "");
if (r1.status) process.exit(r1.status);

// patch playbackRate / autoAdvanceNoVideo on generated optimized if they differ from v3
let optJs = readFileSync(resolve(root, "v1_autoAnswer_optimized.js"), "utf8");
optJs = optJs.replace(/playbackRate:\s*[\d.]+/, `playbackRate: ${opt.playbackRate}`);
optJs = optJs.replace(/autoAdvanceNoVideo:\s*(true|false)/, `autoAdvanceNoVideo: ${opt.autoAdvanceNoVideo}`);
optJs = optJs.replace(/apiKey:\s*"[^"]*"/, `apiKey: ${JSON.stringify(opt.apiKey)}`);
optJs = optJs.replace(/skipChapterTest:\s*(true|false)/, `skipChapterTest: ${opt.skipChapterTest}`);
optJs = optJs.replace(/autoAnswer:\s*(true|false)/, `autoAnswer: ${opt.autoAnswer}`);
optJs = optJs.replace(/autoSubmit:\s*(true|false)/, `autoSubmit: ${opt.autoSubmit}`);
optJs = optJs.replace(/useAI:\s*(true|false)/, `useAI: ${opt.useAI}`);
optJs = optJs.replace(/autoRedo:\s*(true|false)/, `autoRedo: ${opt.autoRedo}`);
optJs = optJs.replace(/autoRedoTimes:\s*\d+/, `autoRedoTimes: ${opt.autoRedoTimes}`);
optJs = optJs.replace(/clearBeforeSelect:\s*(true|false)/, `clearBeforeSelect: ${opt.clearBeforeSelect}`);
optJs = optJs.replace(/decodeFont:\s*(true|false)/, `decodeFont: ${opt.decodeFont}`);
writeFileSync(resolve(root, "v1_autoAnswer_optimized.js"), optJs, "utf8");
console.log("patched v1_autoAnswer_optimized.js personal fields");

const r2 = spawnSync(process.execPath, ["scripts/build-userscript.mjs"], { cwd: root, encoding: "utf8" });
process.stdout.write(r2.stdout || "");
process.stderr.write(r2.stderr || "");
if (r2.status) process.exit(r2.status);

console.log("restore done");
