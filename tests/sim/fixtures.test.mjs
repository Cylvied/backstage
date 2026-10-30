import { test, assert, readFixture, readFixtureJson } from '../harness.js';
import { parsePlanOutput, parseSimOutput } from '../../src/sim/parse.js';
import { applyPatch } from '../../src/sim/apply.js';
import { makeSnapshot } from '../../src/state/snapshot-store.js';

const cases = readFixtureJson('model-outputs/sim/cases.json');
for (const entry of cases) {
    test(`推演样本回归：${entry.file}`, () => {
        const result = parseSimOutput(readFixture(`model-outputs/sim/${entry.file}`));
        assert.equal(result.ok, entry.expectOk, entry.file);
        if (!entry.expectOk || !entry.basedOn) return;
        const base = readFixtureJson(entry.basedOn);
        const before = JSON.stringify(base);
        const state = applyPatch(base, result.patch, { maxCharacters: 12 });
        const snapshot = makeSnapshot({ parent: null, floor: 1, swipeId: 0, text: '测试正文', state,
            status: 'ok', error: null, usage: null });
        assert.equal(snapshot.state.runCount, base.runCount + 1);
        assert.equal(JSON.stringify(base), before);
    });
}

function verifyFirstSample(idOnly) {
    const entry = cases.find(item => item.file === 'ok-01.txt');
    const base = readFixtureJson(entry.basedOn);
    const result = parseSimOutput(readFixture(`model-outputs/sim/${entry.file}`));
    assert.ok(result.ok);
    assert.equal(result.patch.upsertCharacters.length, 2);
    assert.equal(result.patch.upsertThreads.length, 1);
    if (idOnly) {
        result.patch.upsertCharacters.forEach(item => { delete item.name; });
        result.patch.upsertThreads.forEach(item => { delete item.title; });
    }
    const parsed = parseSimOutput(JSON.stringify(result.patch));
    assert.ok(parsed.ok);
    assert.equal(parsed.patch.upsertCharacters.length, 2);
    assert.equal(parsed.patch.upsertThreads.length, 1);
    const next = applyPatch(base, parsed.patch, { maxCharacters: 12 });
    for (const update of parsed.patch.upsertCharacters) {
        const person = next.characters.find(item => item.id === update.id);
        assert.ok(person);
        assert.notEqual(JSON.stringify(person), JSON.stringify(base.characters.find(item => item.id === update.id)));
        for (const [key, value] of Object.entries(update)) assert.deepEqual(person[key], value);
        assert.equal(person.touchedRun, base.runCount + 1);
    }
    for (const update of parsed.patch.upsertThreads) {
        const line = next.threads.find(item => item.id === update.id);
        assert.ok(line);
        assert.notEqual(JSON.stringify(line), JSON.stringify(base.threads.find(item => item.id === update.id)));
        for (const [key, value] of Object.entries(update)) assert.deepEqual(line[key], value);
    }
    makeSnapshot({ floor: 1, swipeId: 0, text: '测试正文', state: next });
}

test('ok-01 确实更新两个人物和一条线', () => verifyFirstSample(false));
test('ok-01 去掉 name/title 后仍更新两个人物和一条线', () => verifyFirstSample(true));

for (const entry of readFixtureJson('model-outputs/plan/cases.json')) {
    test(`规划样本回归：${entry.file}`, () => {
        const result = parsePlanOutput(readFixture(`model-outputs/plan/${entry.file}`));
        assert.equal(result.ok, entry.expectOk, entry.file);
        if (entry.file === 'dirty-enum-02.txt') {
            assert.equal(result.cards.length, 1);
            assert.equal(result.cards[0].suggestedIntensity, 'normal');
        }
    });
}
