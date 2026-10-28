import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareRuntime } from './build-userscript.mjs';
import { watchBridge } from './bridge-watchdog.mjs';

try {
    prepareRuntime();
    console.log('已生成本机专用 codex-helper.user.js，请导入油猴并刷新课程播放页。');
    console.log('后台健康检查已启动；服务异常退出后自动恢复。请保持此窗口打开；Ctrl+C 可停止服务。');
    await watchBridge(path.dirname(fileURLToPath(import.meta.url)));
} catch (error) {
    console.error(error.code === 'EADDRINUSE' ? '本机端口已被占用，请先关闭旧服务或修改配置端口，再重新生成并安装脚本。' : error.message);
    process.exitCode = 1;
}
