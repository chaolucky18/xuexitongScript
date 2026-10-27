# 学习通视频 / 章节测验助手（Edge 控制台 + DeepSeek + 本地字形还原）

不需要 Tampermonkey。DeepSeek API Key 只在启动本地服务时输入一次，存在内存里，不落盘。

本版本相对上一版的**核心变化**：题面不再靠「让大模型猜乱码」，而是由页面脚本把
**内联字体 + 题干选项**交给本机 Python 脚本做字形比对，还原成真字后再问 DeepSeek。
因此也不再需要 Cookie、不再请求学习通任何接口。

---

## 一、本次更新

### 1. 删除

| 删除项 | 原因 |
| --- | --- |
| `5.py`（原作业页抓取脚本） | 里面写死了账号 Cookie（`vc3` / `uf` / `p_auth_token` / `xxtenc`…），且它存在的唯一理由是「用 requests 抓页面」。现在页面已经在浏览器里，抓取这一步整个不需要了 |
| `cookies.local.json` / `cookies.example.json` | 没有抓取动作，就没有 Cookie 需求 |
| `还原题干.py` 里的 `fetch_page` / `load_page_config` / `restore(html)` / `requests` 依赖 | 同上；解码模块不再知道「作业页」长什么样，只接受「字体 + 文本」 |

### 2. 新增 / 改造

| 文件 | 变化 |
| --- | --- |
| `还原题干.py` | 从「抓页面 + 解析 HTML + 解码」的脚本，收拢成**纯解码模块**：对外只暴露 `decode_texts(texts, font_bytes)`，以及 `build_families` / `build_mapping` / `decode_text` 供调参。算法（8×8 网格 0.6 + 64×64 像素 0.4、三字库加权投票、Noto 记 2 票）**一行未改** |
| `font-bridge/font_decode_cli.py` | 变成薄封装：读 JSON → 调 `decode_texts` → 写 JSON；文件式交互，不依赖管道 |
| `font-bridge/font-bridge.mjs` | 优先用**随包 `.venv`** 与**随包 `还原题干.py`**；启动时真正探测解释器能否 import numpy/PIL/fontTools，坏了自动换下一个候选；中转文件放程序目录 `.tmp/`（避开系统 Temp 的安全策略），结果文件写不进去时从 stdout marker 兜底；Python 的 stderr 落到日志并在失败时回传末尾几行；结果按「字体+文本」缓存 8 条 |
| `deepseek-local.mjs` | 新增 `POST /decode`（同一套 Origin 白名单 + 令牌 + 单飞控制）；启动日志多打一行字形还原是否就绪；支持 `DEEPSEEK_API_KEY` 环境变量（便于无交互启动/测试） |
| `xuexitong-console.js` | 答题前自动找 `cxsecret` 字体（内联 base64 或外链 woff2 都支持，任意 iframe），把题干/选项整批送去还原；完成后在控制台打印逐题结果与「乱码 → 真字」对照，并可用 `app.inspectDecoded()` / `app.diagnoseFont()` 复查；还原失败会打印具体原因并退回旧行为 |
| `.venv/` + `fonts/noto-sans-sc/` | 随包提供，开箱即用（Python 3.11.9 / numpy 2.4.6 / Pillow 13.0.0 / fontTools 4.67.0；Noto 分片 101 个 + index.json，约 2.9 MB） |

### 3. 一句话变更摘要（可直接用作提交说明）

> 移除依赖 Cookie 的 `5.py` 与学习通接口请求；字形还原改为「浏览器提供内联字体与题干文本 → 本地 Node 服务 → 随包 Python 解码」的纯本地链路；`还原题干.py` 收敛为无网络依赖的解码模块；补齐 `.venv`、字体分片、测试夹具与自测脚本。

---

## 二、方案

### 2.1 为什么这样分层

字形还原需要三样东西：字体光栅化（FreeType）、矩阵运算（numpy）、多进程打分。
浏览器里做不了（没有 numpy/FreeType，且要重写一遍已调好的算法）；
Python 里做又拿不到页面（没有 Cookie 就得再实现登录态）。
所以把职责切开：**浏览器负责「看见什么」，Node 负责「搬运和鉴权」，Python 负责「认字」。**

```
学习通页面（已登录、已渲染）
   │  ① xuexitong-console.js 就地取出：
   │     · <style> 里 font-cxsecret 的 base64 字体
   │     · 题干 + 选项文字（仍是乱码）
   ▼
POST http://127.0.0.1:37841/decode      （Origin 白名单 + X-Xuexitong-Token）
   │
   ▼
deepseek-local.mjs  ──►  font-bridge.mjs  ──spawn──►  font_decode_cli.py
                              （缓存 / 超时 / 错误归一）        │
                                                               ▼
                                                        还原题干.py
                                       槽位字形 → 位图 → 与 3755 个 GB2312 一级字比对
                                       → 雅黑 / 黑体 / Noto(×2) 各自 argmax → 加权投票
   ◄── {texts, uncertain, codes, seconds} ─────────────────────┘
   │  ② 回填题目文本，再按原流程问 DeepSeek、勾选、提交
   ▼
POST http://127.0.0.1:37841/answer  ──►  DeepSeek API（deepseek-flash）
```

关键点：

- **不请求学习通接口**。页面本身就是数据源，字体和文字都已在内存里，绕开了登录态和接口改版。
- **不落盘**。字体只在 Python 侧写成临时文件，比对完立刻删除；题目文本只走内存。
- **失败可降级**。检测不到字体、Python 缺席、解码超时——任何一环失败都只打印告警，退回「让 DeepSeek 按上下文猜字」的旧行为，不会中断答题。
- **只在真混淆时动手**。必须同时满足「页面有 `.font-cxsecret / .fontLabel` 元素」和「内联 `@font-face` 字体」，才触发还原，避免把正常文本误改。

### 2.2 数据契约

页面 → 本地服务（`POST /decode`）：

```json
{
  "font": "<font-cxsecret 的 base64>",
  "texts": ["Python中搕搛浮搚搙的搙搘鎬搝是:", "int", "float"]
}
```

本地服务 → 页面：

```json
{
  "texts": ["Python中表示浮点数的数据类型是:", "int", "float"],
  "uncertain": { "搛": ["的", "助", "曲"] },
  "codes": 12,
  "seconds": 5.6,
  "cached": false
}
```

- `texts` 与输入**等长、同序**，调用方按序号回填即可。
- `uncertain` 是「有字库唱反调」的槽位及前 3 候选，供人工核对；空对象表示三套字库一致。
- `cached` 为 `true` 时表示命中 Node 侧缓存（同一套字体重复解码）。

Node → Python（文件式，避免 Windows 管道编码问题）：

```
in.json : {"font_b64": "...", "texts": [...]}
out.json: {"ok": true, "texts": [...], "uncertain": {...}, "codes": 12,
           "families": ["msyh.ttc","simhei.ttf","Noto Sans SC"], "seconds": 5.5}
```

### 2.3 鉴权与并发

- 服务只监听 `127.0.0.1:37841`，跨域只放行 `https://*.chaoxing.com`。
- 每次启动生成 48 位随机令牌，写回 `xuexitong-console.js` 的 `LOCAL_TOKEN`；令牌不匹配一律 403。
- `/decode` 与 `/answer` 各自单飞：同一时刻只处理一个请求，并发直接 429。
- 请求体上限：解码 8 MB（字体 ≤ 6 MB、文本 ≤ 300 段 × 5000 字）；答题 100 KB。

---

## 三、验证记录

本机实测（16 核，Python 3.11.9）：

| 检查项 | 结果 |
| --- | --- |
| 造一份假混淆字体（黑体真字挂到 U+6415 起的槽位），走完整链路 | 22 个槽位、6/6 段文本还原正确，`PASS` |
| Python 解码耗时 | 5.32–5.63 s（多进程渲染 3755 候选字） |
| HTTP `/decode` 端到端 | 5.56 s，`codes=22`，`matched 6/6` |
| 同字体第二次请求 | `cached: true`，毫秒级 |
| 无令牌请求 `/health` | 403 |
| `GET /health` | `{"ok":true,"decoder":true}` |
| 服务启动日志 | `字形还原已就绪：…\.venv\Scripts\python.exe + 还原题干.py` |
| 敏感串扫描 | 全目录无 `eyJ…` JWT、无 `sk-` Key、无 Cookie 值 |
| 控制台核对输出 | 用抽出的 `printDecodedQuiz` + 假数据跑通，逐题/对照/告警三段格式见 4.3 |
| 字体提取兼容性 | 内联单引号 / 内联双引号 / 外链 woff2 / 别家字体拒绝 / 优先题目框架 / 回退其他框架 / `cssRules` 兜底 / 全无，共 8 例全部符合预期 |
| 解释器探测 | 把 `CXXT_PYTHON` 指向 `where.exe`（能启动但 import 失败）时自动跳过后用随包 `.venv` 成功解码 |
| 结果写不进去的兜底 | 故意让 CLI 往 `C:\Windows\System32` 写结果：文件写入 PermissionError，但 stdout 的 marker 行仍完整输出，退出码 0 |

自测命令：

```powershell
# 1) Python 侧：假混淆字体 → CLI 解码，逐字对比
.\.venv\Scripts\python.exe .\font-bridge\test\run_decoder_test.py

# 2) Node 侧：假混淆字体 → font-bridge → Python，含缓存断言
node .\font-bridge\test\smoke.mjs

# 3) 重新生成测试夹具
.\.venv\Scripts\python.exe .\font-bridge\test\make_fixture.py
```

**尚未验证**：真实学习通章节测验页面的端到端运行。测试用的是自造字体，
它验证的是「取字体 → 传参 → 解码 → 回填」这条管线，不代表真实页面上的识别准确率；
真实准确率参考原项目的同一页 96/96 结论。

---

## 四、使用

### 4.1 环境

- Windows + Edge；Node.js（`D:\nodejs\node.exe` 或 PATH 中任一 node）。
- Python 已随包提供（`.venv`），无需另装。
- 首次使用请停用旧的 Tampermonkey 脚本，避免与页面脚本同时操作。

### 4.2 启动

1. 双击 `启动DeepSeek本地服务.cmd`（或 `start-local-service.cmd`），粘贴 DeepSeek API Key 回车。
2. 看到这两行即为正常：

   ```
   本地服务已启动：http://127.0.0.1:37841
   字形还原已就绪：...\.venv\Scripts\python.exe
   ```

   第二行不是「已就绪」时会直接写出原因（例如哪个解释器找不到依赖、试过哪些候选），
   照着提示修即可，不会等到答题时才发现。

3. 用记事本打开 `xuexitong-console.js`，Ctrl+A、Ctrl+C 全选复制。
4. Edge 打开学习通课程播放页 → F12 → Console → 粘贴 → Enter。页面会开一个小辅助窗口，
   整页跳转后由它自动重新注入脚本；保持它打开。

> **改过任何 `.mjs` / `.py` 之后必须重启本地服务**：Node 启动时就把模块缓存了，
> 旧进程会继续用旧代码。重启同时会换令牌并重写 `xuexitong-console.js`，
> 所以每次重启后都要**重新复制一次**脚本。

### 4.3 核对还原结果

检测到字体混淆时，还原完成后控制台会打出一整块结果，格式如下：

```
▸ 字形还原结果：5 题 / 14 段改写 / 37 个槽位 / 5.35 秒（请核对）
  1. 【单选题】Python中表示浮点数的数据类型是:
      A. int
      B. str
      C. float
      D. bool
  2. 【多选题】属于面向对象特征的有:
      A. 封装
      B. 继承
      C. 多态
▸ 展开对比 14 段被改写的原文（乱码 → 真字）
  第 1 题题干：Python中搕搛浮搚搙的搙搘鎬搝是:  →  Python中表示浮点数的数据类型是:
  第 1 题 B 选项：搗搘搙  →  str
◂
  ⚠ 有 2 个字各字库判断不一致，提交前重点核对：
      搛 可能是：的 / 助 / 曲
◂
```

- **第一段**是还原后的完整题目和选项，逐题编号，和页面上的题号一一对应。
- **第二段**默认折叠，展开后是「原文 → 还原」逐段对照，方便确认改了什么。
- **黄色告警**列出各字库有分歧的字及前 3 候选，这类字最可能错，优先核对。
- 事后想再看一眼：控制台执行 `app.inspectDecoded()`，返回最近一次还原后的题目数组
  （`app.inspectQuiz()` 返回的则是页面上未经还原的原始识别结果，两者可对照）。

**如果这一块根本没出现、或里面仍是乱码**，按顺序看这几条：

1. 控制台第一行有没有 `[学习通助手] 脚本版本 2026-10-27 字形还原+核对输出`？
   没有就是贴的旧脚本（或整页跳转后的辅助窗口还在复用旧代码）——关掉辅助窗口、刷新页面、重新复制粘贴。
2. 有没有 `没有在当前页面找到 font-cxsecret 字体`？说明整个页面（含 iframe）里没有
   `@font-face`，或样式表跨域读不到。此时脚本会自动把**页面里所有 `@font-face` 的字体名与来源**
   列成表打印出来，同时列出浏览器已加载的 `.woff2/.ttf` 资源。也可以手动运行 `app.diagnoseFont()`：

   | 框架 | 地址 | 混淆标记 | style标签 | cxsecret字体 |
   | --- | --- | --- | --- | --- |
   | 主页面 | /mycourse/studentstudy | 无 | 12 | 无 |
   | iframe 1 | /knowledge/cards | 有 | 3 | 内联 23104 字符 |

   字体既支持 **内联 base64**，也支持 **外链 url(`...woff2`)**——后者脚本会自动下载后再送解码。

3. 有没有 `注意：这批文字里没有任何字符命中该字体的 cmap`？说明取到的字体不是这道题的
   （页面可能同时有几个字体，或抓到的是图标字体），还原自然不生效。
4. 有没有 `字形还原未完成…`？看冒号后的原因：403 是令牌过期（重启服务后没重新复制脚本），
   `无法连接本地 DeepSeek 服务` 是服务窗口被关了。

`app.diagnoseFont()` 不改变任何状态，任何时候都可以跑。

### 4.4 环境变量（可选）

| 变量 | 作用 |
| --- | --- |
| `CXXT_PYTHON` | 指定 Python 解释器（默认优先用随包 `.venv`） |
| `CXXT_DECODER` | 指定 `还原题干.py` 路径（默认随包） |
| `DEEPSEEK_API_KEY` | 免交互启动，跳过粘贴 Key（测试/自动化用） |

### 4.5 目录

```
deepseek-console/
├─ 启动DeepSeek本地服务.cmd / start-local-service.cmd   启动器（内容相同）
├─ deepseek-local.mjs        本地服务：/health /decode /answer
├─ deepseek-request.mjs      DeepSeek 请求构造与解析
├─ xuexitong-console.js      粘贴到页面控制台的脚本（含本地令牌）
├─ 还原题干.py                纯解码模块（不再联网、不需要 Cookie）
├─ font-bridge/
│  ├─ font-bridge.mjs        Node ↔ Python 桥：路径解析、spawn、缓存、超时
│  ├─ font_decode_cli.py     文件式 CLI：{font_b64, texts} → {texts, uncertain}
│  └─ test/                  fixture.json + 三个自测脚本
├─ fonts/noto-sans-sc/       Noto Sans SC 101 个 woff2 分片 + index.json
├─ .venv/                    Python 3.11.9 + numpy / pillow / fontTools
├─ .tmp/                     解码中转文件目录（用完即删，可整目录清掉）
├─ requirements.txt          只列解码所需的三个包（不用随包 .venv 时照此安装）
├─ 安全说明.md                关于已移除的明文 API Key 的处理建议（可删）
```

---

## 五、安全与隐私

- DeepSeek API Key：仅存在于服务进程内存；关闭窗口即失效，不写文件。
- 学习通 Cookie：本版本**完全不使用**。旧 `5.py` 里的 Cookie 已随文件删除；
  若那份脚本曾经外传，请在学习通「退出登录」或改密码使旧会话失效。
- 仓库里不含任何账号凭据：提交前已扫描并移除明文 API Key、JWT 与会话 Cookie。
- 本地令牌：每次启动随机生成、只用于 `127.0.0.1` 回环通信，不是账号凭据。
- 题目与选项会发送到 DeepSeek：调用会产生费用，且内容离开本机；图表题、材料题
  目前只发题面文字，识别不到图片与前文。

## 六、已知限制

1. 只处理 `font-cxsecret` 这一种字体混淆；页面改成 canvas 绘制或字符重排则失效。
2. 候选字库是 GB2312 一级字（3755），生僻字会漏；可把 `gb2312_chars()` 的 `range(0xB0, 0xD8)` 改成 `0xF7`。
3. `uncertain` 里的字仍可能错，答案最终由模型给，模型也会答错——提交前建议抽查。
4. 首次解码 5–6 秒；页面题量大时固定成本，随后同类字体走缓存。
5. 随包 `.venv` 体积较大，不适合放进 git；`.gitignore` 已排除，发布时按需保留或改成 requirements 安装。

## 七、排错

| 现象 | 处理 |
| --- | --- |
| 启动窗口报“缺失文件” | 确认 `deepseek-local.mjs`、`xuexitong-console.js`、`font-bridge/`、`还原题干.py` 在同一目录 |
| `字形还原不可用` | 启动日志会列出试过的解释器和失败原因。`.venv` 不在预期位置时用 `CXXT_PYTHON` 指向 `...\.venv\Scripts\python.exe` |
| 控制台 `/decode` 返回 502、提示 `Python 没有产出结果（退出码 1…）` | 99% 是**服务进程比文件旧**或解释器不对：先**重启本地服务**，确认启动日志是“字形还原已就绪”。错误里会附带 Python 的 stderr 末尾，按它排查依赖 |
| 报错里出现 `PermissionError: ...cxdecode-xxx.out.json` | 安全软件/权限策略拦了 Python 往临时目录写结果。现在中转文件改放程序目录 `.tmp/`，写不进去时还会把结果以 marker 形式走 stdout 兜底；若仍失败，把所用杀软加白名单或设 `CXXT_WORK_DIR` 指一个可写目录 |
| 控制台 `DeepSeek 本地服务不可用` | 服务窗口被关闭，或 Edge 拦截了本地网络访问，需允许 |
| 控制台提示“没有找到 font-cxsecret 字体” | 这一页没有内联/外链的 cxsecret 字体；脚本会打出页面里所有 `@font-face`，也可跑 `app.diagnoseFont()` |
| 还原后仍有个别怪字 | 看控制台 `uncertain` 候选；稳定认错的字可加进 `还原题干.py` 的 `MANUAL_FIXES` |
| `missing ) after argument list` | 粘贴的脚本被截断；从文件 Ctrl+A 重拷，确认结尾是 `})();` |
| 页面顶部“已在调试程序中暂停” | 开发者工具里按 F8 恢复，或关闭“遇到异常时暂停” |
