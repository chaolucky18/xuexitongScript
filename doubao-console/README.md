# 学习通助手 · 豆包桌面版（CDP 驱动，不消耗 API token）

这是 `deepseek-console` 的**薄封装变体**：页面脚本、字形还原、提交流程完全复用原版，
只把「问答题」这一步从 DeepSeek API 换成**本机豆包桌面客户端**。

- 不填 API Key、不消耗 DeepSeek token；
- 用 CDP 直接操作豆包客户端的 DOM：写入问题 → 回车 → 读回答；
- 不截图、不 OCR、不模拟鼠标，窗口最小化到托盘也能跑；
- 端口 **37842**，可以和 DeepSeek 版（37841）并存。

## 目录关系

```
xuexitongScript/
├─ deepseek-console/          原版（DeepSeek API + 字形还原），本变体直接复用它的：
│  ├─ font-bridge/            Node↔Python 桥（字形还原）
│  ├─ fonts/noto-sans-sc/     字库
│  ├─ 还原题干.py              字形比对
│  └─ .venv/                  Python 环境
├─ desktop-doubao/           豆包桌面版 CDP 客户端（POC，含启动器）
└─ doubao-console/           本变体（只放豆包相关的薄封装）
```

`doubao-console` 里只有 6 个文件，不重复字库、不重复 Python 环境。

## 启动

前提：`desktop-doubao/` 与 `doubao-console/`、`deepseek-console/` 保持同级；
豆包自动化实例登录过一次（首次在 `desktop-doubao\启动豆包自动化实例.cmd` 的窗口里扫码）。

双击 **`启动豆包本地服务.cmd`**，它会：

1. 检查豆包调试端口 `127.0.0.1:9333`，没开就自动拉起 `..\desktop-doubao\启动豆包自动化实例.cmd`，最多等 45 秒；
2. 启动本地服务 `http://127.0.0.1:37842`；
3. 打印状态：服务地址 / 字形还原 / 豆包连接情况。

期望输出：

```
豆包版本地服务已启动：http://127.0.0.1:37842（不新建对话：是）
字形还原已就绪：...\deepseek-console\.venv\Scripts\python.exe
豆包已连接：学习通答案搜索 - 豆包（chrome://doubao-chat/chat/...）
```

然后在学习通播放页：F12 → Console → 粘贴 `xuexitong-console.js` 全文 → 回车。
这份脚本连的是 **37842**，和 DeepSeek 版不能同时贴（都会注册 `window.app`）。

## 工作流程

```
学习通页面（xueuitong-console.js）
   │ ① 检测 font-cxsecret → POST /decode  → 复用 deepseek-console 的字形还原
   │ ② 题目 JSON          → POST /answer
   ▼
doubao-local.mjs :37842
   │ 校验题目 / 单飞 / 令牌
   ▼
doubao-request.mjs
   │ 拼 prompt（忽略上下文 + 不确定就联网搜索 + 严格 JSON + 题目数据 + 请求锚点）
   ▼
desktop-doubao/lib/doubao.mjs（CDP）
   │ 写入输入框 → 回车 → 轮询「锚点之后」的助手消息
   ▼
豆包桌面客户端 :9333（Chrome/147 内核）
```

返回仍是 `{"answers":[{"id":1,"letters":["C"]}]}`，页面脚本的 `validateAnswers` 不变。

## Prompt 策略

1. **上下文隔离**：「忽略之前对话中的所有内容，只处理下面这一份测验。」
2. **不确定就搜索**：「遇到不确定、需要最新信息或需要核实事实的题目，先使用联网搜索核实，再根据搜索结果作答。」
   实测豆包会先说「搜索 3 个关键词，参考 17 篇资料」，再给 JSON。
3. **格式硬约束**：只输出 JSON；恰好 N 条；`id` 从 1 到 N 连续；单选/判断 1 个字母；多选列全；字母只能来自选项；每题必答。
4. **请求锚点**：每次提问末尾带 `[#a1b2c3d4]`，只统计该标记**之后**的助手消息，避免同一对话里把上一条回答当成本次结果。
5. **解析兜底**：去 ```json 围栏、扫描所有括号配平的 JSON 对象、优先取条数匹配的最后一个；解析失败或条数不符会**再问一次**。

## 会话命名

服务第一次收到答题请求时，自动把当前会话重命名为 **「学习通答案搜索」**（标题 → 重命名 → 确定）。
改名字：`set DOUBAO_CHAT_NAME=别的名字`。

## 可调环境变量

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `DOUBAO_DEBUG_PORT` | 9333 | 豆包调试端口 |
| `DOUBAO_NEW_CHAT` | 关 | `1` = 每次新建对话 |
| `DOUBAO_CHAT_NAME` | `学习通答案搜索` | 会话名 |
| `DOUBAO_TIMEOUT_SECONDS` | 180 | 单次作答超时 |
| `CXXT_PYTHON` | 随包 `.venv` | 字形还原用的 Python |

## 实测（2026-10-27）

| 场景 | 结果 |
| --- | --- |
| 3 题测验（含字形混淆） | 字形还原 3 题 / 7 段改写 / 30 槽位，5.46 s；豆包作答后提交成功，进入下一节 |
| 连续两轮 3 题（不新建对话） | 4.9 s / 5.2 s，答案一致，未串上一条回答 |
| 连续两问数字题 | 2.9 s / 2.5 s，分别得到 2 和 6 |
| 需要事实核实的题 | 触发联网搜索（3 个关键词 / 17 篇资料），返回干净 JSON |
| 服务启动 | 自动探测豆包连接，输出「豆包已连接」 |
| `/health` | `{ok:true, provider:"doubao", decoder:true, doubao:{ok:true,...}}` |

## 清理 / 卸载（用完想恢复干净）

按顺序执行即可，随时可停：

1. **停页面脚本**：学习通控制台执行 `app.destroy()`，或直接刷新页面。
2. **停本地服务**：关掉「豆包本地服务」黑窗口（或结束 `node.exe` 里跑 `doubao-local.mjs` 的进程）。
3. **停豆包自动化实例**：在豆包窗口/托盘右键退出；注意它和你日常用的豆包是**两个独立实例**，别把日常那个也关了。
4. **清登录态**：删除 `desktop-doubao\doubao-auto\`，下次要重新扫码。
5. **清临时文件**：删除 `deepseek-console\.tmp\`、`deepseek-console\__pycache__\`（会自动再生成）。
6. **清令牌（如果做过 PR/测试）**：
   ```powershell
   setx GH_TOKEN ""
   ```
   并到 <https://github.com/settings/tokens> 吊销对应的 PAT。
7. **彻底移除本方案**：删除 `doubao-console\` 和 `desktop-doubao\` 两个目录即可；
   `deepseek-console\`、光标脚本、字库都不受影响，原 DeepSeek 版照常可用。

> 不想删也能随时切回：关掉豆包版服务，重新双击 `deepseek-console\启动DeepSeek本地服务.cmd`，
> 再粘贴 DeepSeek 版的 `xuexitong-console.js` 即可（两个服务端口不同，不冲突）。

## 排错

| 现象 | 处理 |
| --- | --- |
| 启动窗口报「豆包不可用」 | 豆包自动化实例没开或没登录；运行 `desktop-doubao\启动豆包自动化实例.cmd` 后扫码 |
| 页面提示「豆包未就绪」 | 同上；`/health` 的 `doubao` 字段会给出原因 |
| 502 / 豆包作答失败 | 看服务窗口报错；`node ..\desktop-doubao\ask.mjs --status` 可单独检查豆包 |
| `豆包返回 N 个答案，题目有 M 道` | 锚点定位失效（页面结构变化）；用 `--debug` 看抓到的消息行 |
| `Unexpected non-whitespace character after JSON` | 模型把格式示例和答案粘在一起；解析器已支持多对象，仍报错就把输出发我 |
| 字形还原不可用 | `deepseek-console\.venv` 被删；或设 `CXXT_PYTHON` |
| 令牌不匹配 | 重启服务后令牌会变，必须重新复制 `xuexitong-console.js` |

## 限制与风险

- 豆包**串行**：一次只答一套题；一套 20 题建议一次 prompt 问完。
- 依赖豆包客户端版本（当前 2.27.x / Chrome 147）；升级后 DOM 变了需要改 `desktop-doubao/lib/doubao.mjs` 的选择器。
- 豆包「记忆」会跨对话保留信息，介意就在豆包设置里关掉。
- 自动化操作客户端可能违反豆包用户协议，高频使用有风控风险，账号风险自担。
- 本变体不含 `fonts/` 和 `.venv`，必须和 `deepseek-console/` 放在同一父目录下使用。
