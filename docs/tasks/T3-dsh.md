# T3 · dsh：测试样本库（已更换任务）

> 发布：Claude · 2026-10-30（**本任务替换了之前的"提示词"任务**；如果你已经写了 src/prompts 或 src/inject 下的文件，请删除你自己写的这些文件）
> 先读：`COLLAB.md` → `src/types.js`（全部类型）→ `src/constants.js`（全部枚举值）→ `docs/INTERFACES.md` 第 3 节

## 你负责的文件（只能写这些）

```
tests/fixtures/**      （整个目录归你，只能在这里新建文件）
```

其他文件全部只读，**不要写任何 .js 代码文件**。

## 背景

插件会把模型的输出解析成 JSON，再合并进"推演状态"。Codex 和组长需要大量真实感强的样本来测试解析和合并。你的任务是**照着规格批量写样本**。不需要写代码，但每个样本都必须严格符合格式。

## 要做的事

### 1. 推演状态样本：`tests/fixtures/states/*.json`（至少 8 个）

- 每个文件是一个完整的 `SimState`，字段和 `src/types.js` 里的 `SimState` 完全一致，不多不少。
- 题材各不相同：武侠、校园、西幻、现代都市、悬疑、宫廷、末日、修仙。
- 每个包含 3–10 个人物、2–5 条线、0–3 条 signals。
- 所有 id 用规定前缀：人物 `c_` + 6 位小写字母或数字（如 `c_a1b2c3`），线 `t_` + 6 位。线里的 `characterIds` 必须指向本文件中真实存在的人物 id。
- 必须覆盖这些特殊情况，每种至少出现在一个文件里，并在文件名里体现：
  - `*-pinned.json`：有钉住的人物（`pinned: true`）
  - `*-guide.json`：有一条 `origin: "user"` 且 `guide.status: "active"` 的线
  - `*-isolated.json`：`protagonist.reachable: false`
  - `*-faded.json`：有 `stage: "faded"` 的线，并带内部字段 `fadedRuns`
  - `*-crowded.json`：人物恰好 14 个（超过上限 12，用于测试淘汰）
  - `*-dead.json`：有 `life: "dead"` 和 `life: "missing"` 的人物

### 2. 推演输入样本：`tests/fixtures/inputs/*.json`（至少 5 个）

- 每个文件是一个 `SimInput`，和某个状态样本同题材，文件名对应，例如 `wuxia.json` 对应 `states/wuxia.json`。
- `recent` 写 4–6 楼对话，用户和角色交替，中文，每楼 50–300 字，有具体的情节。
- `worldInfo` 写 2–4 条设定条目正文。`memos` 写 0–3 条。

### 3. 模型原始输出样本：`tests/fixtures/model-outputs/sim/*.txt`（至少 30 个）

- 每个文件模拟推演模型的一次完整回复，内容是一个 `SimPatch`（见 `docs/INTERFACES.md` 第 3.7 节）。
- 约一半是**正常的**：带 ```` ```json ```` 代码块，字段合法，基于 `states/` 里的某个状态（引用其中真实存在的 id）。
- 另一半是**脏的**，每种至少 2 个：
  - JSON 前面有 `<think>…</think>` 思考过程
  - 代码块前后有闲聊
  - 没有 ```` ``` ```` 代码块，直接输出 JSON
  - 有尾逗号
  - 在 JSON 中间被截断
  - 枚举值写错（如 `"stage": "进行中"`）
  - 有多余的未知字段
  - `knows` 超过 5 条；某条 signal 的 `text` 超过 80 字
  - `noChange: true` 且其余列表都为空
  - 完全不是 JSON（模型拒绝或胡言乱语）
- 写一个索引文件 `tests/fixtures/model-outputs/sim/cases.json`：

  ```json
  [
    { "file": "ok-01.txt", "basedOn": "states/wuxia.json", "expectOk": true, "notes": "更新 2 个人物，新增 1 条线" },
    { "file": "dirty-think-01.txt", "basedOn": "states/school.json", "expectOk": true, "notes": "带 think 标签，内容合法" },
    { "file": "dirty-truncated-01.txt", "basedOn": null, "expectOk": false, "notes": "在 upsertThreads 中间截断" }
  ]
  ```

  `expectOk` 的判断标准：去掉思考过程和闲聊、修正尾逗号之后，能得到一个完整的 JSON 对象 → `true`；截断、根本不是 JSON → `false`。枚举错误、多余字段、超长内容都算 `true`（解析器会丢弃或截断这些部分，不算整体失败）。

### 4. 规划输出样本：`tests/fixtures/model-outputs/plan/*.txt`（至少 10 个）

- 内容是 `{ "cards": PlanCard[] }`，正常和脏的各一半，脏的种类同上。同样写 `cases.json`。

### 5. 世界书纪要样本：`tests/fixtures/worldbook/database-memos.json`（1 个文件）

- 一个数组，40 条：`[{ "name": "...", "content": "...", "keys": ["..."] }]`
- 其中 30 条是数据库纪要，名字严格是 `TavernDB-ACU-CustomExport-纪要-1` 到 `-30`，内容是同一个故事（用 `inputs/` 里某个题材）的分段剧情纪要，每条 80–200 字。
- 另外 10 条是**干扰项**，名字相似但不匹配：如 `TavernDB-ACU-CustomExport-人物-1`、`纪要-3`、`TavernDB-ACU-CustomExport-纪要-abc`、`TavernDB-ACU-CustomExport-纪要-12-备份`。
- 在同目录写 `database-memos.cases.json`：列出 3–5 个查询词（如某个人名、地名），以及你认为最相关的 3 条纪要的名字。

## 格式要求（最重要）

- 所有 `.json` 文件必须是**合法 JSON**：双引号、没有注释、没有尾逗号（只有"脏输出"样本才故意写错，而那些是 `.txt`）。
- 枚举值只能用 `src/constants.js` 里列出的英文值，不能写中文，不能自造。
- 写完每个 `.json` 文件后，**重新读一遍检查**：括号是否配对、字段名是否和 types.js 完全一致、id 引用是否存在。

## 交付

1. 全部写完后，用追加方式（`cat >> docs/LOG.md <<'EOF'`）写一条：

   ```
   ## <时间> [dsh] [完成] T3
   - 新建文件：（按目录列出数量和文件名）
   - 自检：（说明你检查了哪些项）
   - 不确定的地方：（逐条列出）
   ```

2. 不要执行任何 git 写操作，不要改 TASKS.md，不要安装任何东西。
3. 遇到看不懂的规格：在 LOG 写 `[阻塞]` 说明问题，然后继续做其他部分。
