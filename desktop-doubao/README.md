# 豆包桌面版自动化（POC）

用 CDP（Chrome DevTools Protocol）驱动豆包桌面客户端：往输入框写问题、回车发送、读回答。
不模拟鼠标、不截图 OCR、不抢前台焦点，窗口最小化到托盘也能跑。

> 2026-10-27 实测通过：登录后单问 2.5–4.1 秒返回，3 道题的批量 JSON 请求 3.4 秒返回干净 JSON。

## 实测结果

```
$ node ask.mjs --json "只回答一个字母：中国的首都是？A 上海 B 北京 C 广州 D 深圳"
{
  "ok": true,
  "answer": "B",
  "elapsedMs": 2545,
  "truncated": false
}

$ node ask.mjs --prompt-file quiz.txt        # 三道题，要求只输出 JSON
{
  "ok": true,
  "answer": "{\"answers\":[{\"id\":1,\"letters\":[\"C\"]},{\"id\":2,\"letters\":[\"A\",\"B\",\"C\"]},{\"id\":3,\"letters\":[\"A\"]}]}",
  "elapsedMs": 3374
}
```

回答提取抓的是助手消息的正文容器（`[class*="blockLayout-"]`），会自动排除：

- 你自己那条提问（用户消息也在同一个 `v_list_row` 列表里）
- 回答下方的「猜你想问」推荐气泡（`[class*="suggest-message-list-wrapper"]`）
- 复制/重新生成等按钮（本身没有文本）

## 已验证 / 说明

| 能力 | 状态 |
| --- | --- |
| 独立配置启动带调试端口的豆包 | ✅ 不影响日常用的那个豆包 |
| 连接 CDP、识别页面、判断是否登录 | ✅ `--status` |
| 写入输入框（tiptap）并清空 | ✅ `--selftest` |
| 回车发送 / 失败回退点发送按钮 | ✅ 实测回车即发送 |
| 等待流式结束并提取正文 | ✅ 文本稳定 1.5s 且无“停止”按钮即结束 |
| 会话重命名（标题 → 重命名 → 确定） | ✅ `client.renameConversation(name)` |
| 每次提问前新建对话 | ✅ 实测每次消息列表只有「提问 + 回答」两行 |
| 批量题目一次问完并返回 JSON | ✅ 3 题 3.4s |
| 未登录时明确报错 | ✅ |

## 快速开始

```powershell
# 1) 启动专用实例（独立配置，存在 doubao-auto\）
双击：启动豆包自动化实例.cmd

# 2) 在弹出的窗口里扫码登录一次

# 3) 自检
node ask.mjs --status      # hasEditor=true, looksLoggedOut=false

# 4) 提问
node ask.mjs "用一句话介绍你自己"
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `node ask.mjs --status` | 连接状态 + 是否登录 |
| `node ask.mjs --selftest` | 只写输入框再清空，不发送 |
| `node ask.mjs "问题"` | 新建对话 → 输入 → 发送 → 等回答 → 打印 |
| `node ask.mjs --json "问题"` | 输出 `{ok, question, answer, elapsedMs}` |
| `node ask.mjs --prompt-file quiz.txt` | 从文件读 prompt（长文本、带引号时用这个） |
| `node ask.mjs --debug "问题"` | 额外打印消息行摘要（校准/排错用） |
| `node ask.mjs --dump` | 打印页面状态 + 当前消息行 + 页尾文本 |
| `node ask.mjs --no-new-chat "问题"` | 接着当前会话问 |
| `node ask.mjs --timeout 180 "问题"` | 自定义超时秒数（默认 120） |

端口用 `DOUBAO_DEBUG_PORT` 改；豆包路径用 `DOUBAO_EXE`。

## 工作原理

```
启动器
  Doubao.exe --remote-debugging-port=9333 --user-data-dir=<本目录>\doubao-auto
        │
        ├─ GET  /json/list                        → 找 doubao://doubao-chat/chat
        ├─ WS   Runtime.evaluate                  → 定位 div.tiptap.ProseMirror
        ├─ WS   Input.insertText                  → 写入问题（等价输入法上屏）
        ├─ WS   Input.dispatchKeyEvent(Enter)     → 发送（失败则点“发送”按钮）
        └─ WS   Runtime.evaluate（每 400ms 轮询）  → 读最后一条助手消息正文
                文本连续 1.5s 不变 且 无“停止”按钮 ⇒ 认为生成结束
```

消息结构（实测）：

```
div.v_list-D34x3M
└─ .scroller → .scroller_content → .list_items
   ├─ div.v_list_row      ← 用户提问（含时间戳）
   └─ div.v_list_row      ← 助手回答
        ├─ div[class*="blockLayout-"]      ← 正文（取这个）
        ├─ div.message-action-bar-*        ← 复制/重生成（无文本）
        └─ div[class*="suggest-message-list-wrapper"]
              └─ .suggest-list-item ×N     ← “猜你想问”，要排除
```

## 已知限制

- **合规/风控**：自动化操作客户端通常违反豆包用户协议，高频请求可能触发限流或风控，账号风险自担。
- **“记忆”功能**：豆包会把“我叫小明”这类内容存成长期记忆（实测新对话仍能召回）。如果不想让题目互相影响，建议在豆包设置里关掉记忆，或每次用不同 prompt 前缀。
- **列表编号丢失**：助手用 CSS 渲染有序列表时，`innerText` 里没有 `1.` 这类前缀，提取到的是纯文本。答题场景不受影响，需要原文排版时要另处理。
- **登录态**：独立配置首次需扫码，存在 `doubao-auto\`，删目录即重置。
- **版本更新**：豆包升级后 DOM 可能变化；启动时它自己也自动升到了 2.27.12，目前结构仍可用。
- **串行**：单窗口一次只处理一个问题；一套多题测验请一次 prompt 问完。

## 接入现有方案（下一步）

`deepseek-console` 已有完整的题目校验/提交逻辑，只需把「问答」抽象成 provider：

```js
ask(prompt) -> Promise<string>     // 豆包实现内部就是 client.ask(prompt).text
```

`deepseek-local.mjs` 加 `PROVIDER=deepseek|doubao` 开关，学习通页面脚本不用改。
注意豆包单次 3–10 秒、串行，建议整套题一次问完再解析 JSON。

## 清理

- 关闭自动化实例：在豆包窗口/托盘退出（别关错成日常用的那个）。
- 清登录态：删除 `desktop-doubao\doubao-auto\`。
- 清临时文件：`deepseek-console\.tmp\`。
- 彻底移除：删掉本目录即可；`doubao-console\` 若在用也一并删除。

## 文件

```
desktop-doubao/
├─ 启动豆包自动化实例.cmd   带调试端口启动专用实例
├─ ask.mjs                  命令行：status / selftest / dump / 提问 / prompt-file
├─ lib/doubao.mjs           CDP 客户端：连接、输入、发送、等回答、清洗
└─ doubao-auto/             专用配置（首次登录后生成，可删）
```
