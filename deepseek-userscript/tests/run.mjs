import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
for (const file of readdirSync(new URL('.',import.meta.url)).filter(f=>f.endsWith('.mjs')&&f!=='run.mjs')) {
 const result=spawnSync(process.execPath,[fileURLToPath(new URL(file,import.meta.url))],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
for(const mode of ['play-race','play-success','chapter-race','navigation-retry','iframe-replaced','media-error']) {
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('video-quiz-integration.mjs',import.meta.url)),mode],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
