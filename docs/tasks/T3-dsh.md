# T3 · dsh：推演提示词、规划提示词与注入文本

> 发布：Claude · 2026-10-30
> 先读：`COLLAB.md` → `docs/brainstorm/SUMMARY.md`（尤其第 2 轮决定）→ `docs/INTERFACES.md`（全文）→ `src/types.js` → `src/constants.js`

## 你负责的文件（只能写这些）

```
src/prompts/sim-prompt.js
src/prompts/plan-prompt.js
src/inject/compose.js
tests/prompts/*.test.mjs
tests/inject/*.test.mjs
docs/prompts-notes.md        （你的设计说明，可选但推荐）
```

其他文件全部只读。需要新类型或常量，写 `[接口变更提议]`，**不要自己加**。界面（面板、角标）是下一批任务，这次不做。

## 要做的事

### 1. 推演提示词 `buildSimPrompt`（最重要）

- 输入输出见 `docs/INTERFACES.md` 第 5.7 节。输出必须让模型返回第 3.7 节的 `SimPatch` JSON。
- 落实你在意见书里提的 7 条原则，并加上：人物有自己的生活；`knows` 每条必须写渠道；当前行动与长期行动分开结算；主角处境（位置、能否接触外界）每轮核对。
- **向模型展示状态时，隐藏内部字段**（`touchedRun`、`fadedRuns`、`runCount`），但要保留 `id`，让模型能在 patch 里引用已有对象。
- 要求模型给每条 signal 打 `relevance`（1–3），并且**允许 `signals` 为空、允许 `noChange: true`**。
- 用户采纳的引导（`guide.status='active'` 的线）要单独呈现给模型：推演应该让这条线在镜头外**自然**往前走，并按强度给出相应的 signal；不得替主角行动。
- 推演模型可能是便宜的小模型：结构清晰比文采重要，提示词总长度尽量控制在 3000 字以内（不含输入资料）。

### 2. 规划提示词 `buildPlanPrompt`

- 用户可能附一句想法（`request`，可为空）。输出 `{ "cards": PlanCard[] }`，最多 3 张。
- 方案必须**挂在已有的线或人物上**（这是我们和故事神谕的本质区别）：优先给 `threadId`；只有确实需要新线时才留空。
- `fit` 要具体写出呼应了哪条线、哪个人物、哪段前文。

### 3. 注入文本 `selectSignals` + `composeInjection`

- 规则见第 5.8 节。全部是纯函数。
- **标签措辞由你设计**。要求：
  - 用户主要用 **Gemini**；注入会变成正文前的一个独立 user 回合，必须让模型一眼看出这是"幕后备注"，不是主角说的话，角色也看不见它。
  - 暗流块写明"仅供把握，不必兑现，不得直接点破"。
  - 引导块按强度写"节奏"：只铺垫 / 自然推进 / 尽快引爆。始终写明"主角的行动优先，偏离时跟随主角"。
  - 绝不出现"你应该让主角……"这类替主角做决定的话。
- 没有可注入的内容时返回空字符串。

## 参考

- `refs/stitches/preset_dump.txt` 第 77–343 行的写作规则（认知边界、情绪不极端化、角色有生活感）值得借鉴其**思路**。
- `refs/shujuku/src/service/simulation/agent/dramatis-keeper-prompt.ts`、`guidance-composer-prompt.ts` 的约束写法可以参考。
- **只借鉴思路，不要整段复制**参考项目的提示词。附件预设里那些和推演无关的内容（角色扮演设定、破限语）一律不要带进来。

## 测试（必须写）

- `compose.js`：各种 voice 组合、`reachable=false`、上限 0/1/3、无 active guide、push 强度。
- 提示词：给一个样例状态和输入，断言输出是合法的 `ChatMessage[]`、包含必需的段落、没有泄露内部字段。
- 用 `node:test` + `node:assert/strict`。本机没有 Node：**写好测试，不要尝试安装任何东西**，在 LOG 里注明"测试已写，未运行"。

## 交付

1. 所有文件写完后，用追加方式（`cat >> docs/LOG.md <<'EOF'`）写一条：

   ```
   ## <时间> [dsh] [完成] T3
   - 改动文件：（逐个列出）
   - 注入标签设计：（贴出实际的注入文本样例）
   - 测试：已写 N 个用例，未运行（无 Node）
   - 需要组长注意：（契约里没说清、你自己做了决定的地方）
   ```

2. 不要执行任何 git 写操作，不要改 TASKS.md。
3. 遇到契约不清或必须改别人的文件：写 `[阻塞]` 或 `[接口变更提议]` 到 LOG，然后继续做不受影响的部分。
