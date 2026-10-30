# 协作日志（只追加，不修改、不删除他人条目）

## 2026-10-30 [claude] [决定] 建立协作约束
- 新建 COLLAB.md / TASKS.md / docs/INTERFACES.md / docs/LOG.md
- 所有成员开工前请先阅读 COLLAB.md

## 2026-10-30 [claude] [决定] 发布第 1 轮头脑风暴
- 任务书：docs/brainstorm/BRIEF.md
- Codex 负责 B1（技术可行性与架构），dsh 负责 B2（产品与叙事设计）
- 参考资料已下载到 refs/（只读，已 gitignore）
- 本轮只写意见书，不写代码

## 2026-10-30 [claude] [决定] 加强共用工作区约束
- COLLAB.md 新增 6.5 节：LOG 只能用 >> 追加、文件名不能只差大小写、refs 只读、依赖与构建只由组长执行等
- 意见书文件名改为 docs/brainstorm/opinion-<名字>.md（原 claude.md 与 CLAUDE.md 撞名）
- 第 1 轮头脑风暴期间，组员只能写自己的意见书，其余文件全部只读

## 2026-10-30 [claude] [完成] 第 1 轮头脑风暴汇总
- Codex、dsh 意见书已交付，均遵守了工作区约束
- 汇总与组长裁定：docs/brainstorm/SUMMARY.md
- 等待用户拍板第 4 节问题后再写接口文档；在此之前组员不要开工

## 2026-10-30 [claude] [决定] 发布第 1 批实现任务
- 用户已拍板：导演第一版不做；注入在深度 1，暗流与引导分块；借鉴人物谱 3 点；可选读取数据库纪要
- 接口文档：docs/INTERFACES.md（v1）；类型：src/types.js
- 技术栈：原生 JS ES 模块，无构建、无依赖；本机无 Node，测试先写不跑
- Codex → T2（docs/tasks/T2-codex.md），dsh → T3（docs/tasks/T3-dsh.md），Claude → T1
- git 规则变更：组员不执行 git 写操作，由组长审查后统一提交（COLLAB.md 第 4 节）

## 2026-10-30 [claude] [决定] 调整 T3 分工
- 用户要求给 dsh 安排量大、格式固定、不易出错的工作
- 提示词（src/prompts/*）与注入文本（src/inject/*）改由 Claude 负责
- dsh 的 T3 改为测试样本库，只写 tests/fixtures/**，见 docs/tasks/T3-dsh.md（已重写）
- Codex：T2 不受影响。tests/fixtures/ 由 dsh 提供，你的测试可以先不依赖它，样本到位后组长再通知

## 2026-10-30 [claude] [决定] 接口补充（给 Codex）
- INTERFACES.md 5.3：scheduler 中 reason='manual' 的任务不参与去重（用户点"重新推演"时必须真的重跑）

## 2026-10-30 [codex] [开始] T2
- 已完整阅读最新 COLLAB.md、TASKS.md、INTERFACES.md、T2 任务书及类型/常量/工具。
- 按既有认领实现 src/state/{snapshot-store,scheduler}.js、src/sim/{parse,apply}.js、src/memory/database-memo.js 及各自测试；不修改 TASKS.md，不执行 git 写操作。
- command -v node 未找到运行时，遵照任务书不安装依赖，测试先编写后静态核查。
- 提醒：fallbackSnapshot 的分支不保证正确是现有契约已知限制，本次按契约返回 stale=true，不自行改变接口。

## 2026-10-30 [claude] [决定] 接口补充（给 Codex）
- INTERFACES.md 5.5：patch.noChange=true 且 patch.signals 为空时，applyPatch 保留上一轮的 signals，不清空

## 2026-10-30 [claude] [决定] 测试现在可以真正运行了（Codex 请注意）
- 不需要 Node：用 macOS 自带的 JavaScriptCore 运行，命令 `sh tests/run.sh tests/state`（或 tests/sim、tests/memory）
- 测试写法改为：`import { test, assert } from '../harness.js';`，**不要用 node:test / node:assert**（jsc 里没有）
- 断言：ok / equal / notEqual / deepEqual / match / doesNotMatch / throws / rejects；支持 async 测试
- 已写好的 node:test 测试只需改 import 两行
- 运行测试是允许的（只在系统临时目录产生文件）；交付时请写明测试结果，而不是"未运行"
- 示例：tests/inject/compose.test.mjs（10/10 通过）
