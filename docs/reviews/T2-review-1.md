# T2 审查意见（第 1 轮）

> 审查人：Claude · 2026-10-30
> 结论：**整体质量好，需修改后通过**。66 个测试全部通过；契约落实到位；日志里主动说明了取舍，这点很好。
> 下面 5 条需要修改。第 1 条是用 dsh 的样本库实测发现的，属于契约定得太死，不是你的错，契约已改（INTERFACES.md v1.2，3.7 节）。

## 必须修改

### 1. 只有 id、没有 name/title 的更新被整条丢弃
- 现象：`tests/fixtures/model-outputs/sim/` 的 20 个正常样本里，模型更新已有人物/线时只写了 id。`parse.js:101`、`:113` 要求必须有 name/title，导致这些更新全部被丢弃。实测 ok-01 应更新 2 个人物、1 条线，实际为 0/0。
- 改法：有 id 时 name/title 可省略；无 id 时才必须有。`apply.js` 里，有 id 但找不到、又没有 name/title 的条目丢弃。

### 2. `"id": null` 导致整条被丢弃
- 模型给新对象写 `"id": null` 很常见。`parse.js:98` 的 `id: string` 校验会让整条失败。
- 改法：`id` 为 null 时视为没写。

### 3. 模型不能修改用户专属字段
- `parse.js:99` 接受模型写的 `pinned`；`parse.js:111`、`:123` 接受模型写的 `origin`、`guide`。
- 风险：提示词里展示了带 guide 的线，模型回写时很可能把 `guide` 写成 null 或改掉，用户采纳的引导就被抹掉了。
- 改法：解析时丢弃这三个字段（不报错、不 warning）。新线的 origin 仍由 `newThread` 设为 'sim'。

### 4. 同一次输出里新建对象的引用
- 模型在同一个补丁里新建人物"老周"，又在新线的 `characterIds` 里写 `"老周"`（它不知道程序会生成什么 id）。目前 `apply.js:83-87` 会把它当悬空引用清掉。
- 改法：清理悬空引用之前，先把能按名字（含别名）/标题对上的引用换成 id。

### 5. 用样本库做回归测试
- 新增 `tests/sim/fixtures.test.mjs`：遍历 `model-outputs/sim/cases.json`，断言 `parseSimOutput(...).ok === expectOk`；对 `expectOk && basedOn` 的条目，`applyPatch` 后 `makeSnapshot` 不抛错。另外对 ok-01 断言确实更新了 2 个人物、1 条线。
- 读取样本用 `import { readFixture, readFixtureJson } from '../harness.js'`（路径相对 `tests/fixtures/`，例如 `readFixtureJson('states/wuxia.json')`）。
- 注意：dsh 还在写 plan 样本和纪要样本，**只用 `model-outputs/sim/` 和 `states/`**；样本文件本身是 dsh 的，有问题在 LOG 里写 `[请求修改]`，不要改。

## 不用改，但请知悉

- 调度器改成全局单工作槽：同意，比契约更保守，好。
- `pinned` 的人物超出上限也保留：同意。
- `parse.js:49` 只去 `<think>`，不处理 `<thinking>`：可以顺手加上，不强制。

## 交付

改完后跑 `sh tests/run.sh`，全部通过后在 LOG 追加 `## <时间> [codex] [完成] T2 审查修改`，写明改了什么和测试结果。不要改 `docs/`、`src/types.js` 和 fixtures。

## 补充（dsh 交付样本库后追加）

### 6. 规划卡的 `suggestedIntensity` 写错时不应整张丢弃
- 样本 `model-outputs/plan/dirty-enum-02.txt`：唯一一张卡的 `suggestedIntensity` 是 "快速推进"，目前整张卡被丢弃，导致解析失败（cases.json 预期成功）。
- 改法：`suggestedIntensity` 只是建议值，不合法时改成 `'normal'` 并 warning，卡片保留。
- 回归测试里同样遍历 `model-outputs/plan/cases.json`。

### 关于第 1 条的更正
- dsh 交付前已给样本补上 name/title，ok-01 现在能正确更新 2 个人物、1 条线。第 1 条仍需修改（真实模型很可能只写 id），回归测试里请自己构造一个只写 id 的用例，不要依赖样本。
