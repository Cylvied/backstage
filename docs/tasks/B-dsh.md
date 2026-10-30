# B 批 · dsh：v1.5 测试样本

> 发布：Claude · 2026-10-30
> 你的 T3 样本库质量很好，这次在它的基础上补 v1.5 的新格式。
> 先读：`src/types.js`（新增的 Stamp、ChronicleEntry、SimPatch 的 addEvents / markKnown / loreRequests、Signal.eventId）→ `docs/INTERFACES.md` 第 7 节 → 你自己之前写的 `tests/fixtures/` 下的样本

## 你负责的文件（只能在这里新建文件，不要修改已有样本）

```
tests/fixtures/v15/**
```

不要写任何 .js 文件，不要改 `tests/fixtures/` 下已有的文件。

## 要做的事

### 1. 带事件记录的状态：`tests/fixtures/v15/states/*.json`（至少 5 个）

- 以你之前的 `states/wuxia.json`、`palace.json`、`mystery.json`、`school.json`、`western.json` 为底，复制后补充：
  - `chronicle`：每个文件 5–15 条事件，按时间顺序。`id` 用 `e_` 加 6 位小写字母或数字，`at` 为 `{ "day": 数字, "slot": "时段" }`，`day` 不能大于该状态的 `clock.day`。约一半 `known: true`（同时写 `knownAt`），其余 `known: false`、`knownAt: null`。`characterIds`、`threadIds` 指向本文件里真实存在的人物和暗线。
  - 人物的 `currentAction`、`longAction` 加上 `since`（同样不能晚于当前时间）。
  - `loreWanted`：0–3 条，`{ "title": "条目标题", "sinceRun": 不大于 runCount 的数字 }`。
  - 部分迹象加 `eventId`（指向一条 `known: false` 的事件）和 `bornRun`。
- 另做一个 `legacy.json`：直接复制旧样本，**不加任何新字段**（用于测试旧数据兼容）。

### 2. 推演输出样本：`tests/fixtures/v15/model-outputs/sim/*.txt`（至少 20 个）＋ `cases.json`

- 基于第 1 步的状态，正常与"有问题"的各一半。正常的要用到 `addEvents`、`markKnown`、`loreRequests`、带 `eventId` 的迹象（包括 `"new:0"` 这种引用同一输出里新事件的写法）。
- "有问题"的每种至少 2 个（这些是**内容问题**，JSON 本身是合法的）：
  - `clock.day` 比当前状态小（时间倒退）
  - `markKnown` 指向不存在的事件 id
  - 新增的 knows 写成"知道：xxx"却没有括号写渠道
  - 迹象的 `eventId` 写成 `"new:5"`，但 `addEvents` 只有 2 条
  - 模型自己写了 `since`、`at`、`known` 等程序字段
- `cases.json` 每项：`{ "file", "basedOn", "expectParseOk", "expectRejectedKinds": [...], "notes" }`。`expectRejectedKinds` 写你认为程序检查会丢弃的种类（`clock`、`reference`、`knows`、`mark_known` 等，见 types.js 的 ReviewKind），没有就写空数组。

### 3. 审核员输出样本：`tests/fixtures/v15/model-outputs/review/*.txt`（至少 10 个）＋ `cases.json`

- 格式：`{ "verdicts": [ { "id": "r1", "ok": true, "reason": "" } ] }`。
- 正常与脏的各一半：带思考过程、前后有闲聊、尾逗号、被截断、`ok` 写成字符串 `"true"`、缺少某些 id 的裁决、出现不存在的 id。
- `cases.json` 每项：`{ "file", "expectOk", "notes" }`。

## 格式要求

- `.json` 必须是合法 JSON；只有 `.txt` 里的脏样本才故意写错。
- 枚举值只用 `src/constants.js` 里的英文值。
- 每个文件写完重新读一遍：括号配对、字段名和 types.js 一致、id 引用存在、时间不晚于当前 clock。

## 交付

在 `docs/LOG.md` 用追加方式写 `## <时间> [dsh] [完成] B 批样本`，列出文件数量、自检项目、不确定的地方。不执行 git 写操作，不安装任何东西。
