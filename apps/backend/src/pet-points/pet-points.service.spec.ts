import { PetPointsService } from './pet-points.service';
import type {
  CompletedPet,
  EvaluationRecord,
  StudentPet,
} from './pet-points.types';

function setup() {
  const initial = (id: string): StudentPet => ({
    id,
    name: id,
    studentNo: id,
    classId: 'class',
    className: '测试班',
    group: '一组',
    score: 0,
    maxScore: 30,
    trophies: 0,
    level: 1,
    stage: '初始形态',
    petId: 'sprout-puff',
    petProgress: 0,
    petExperience: 0,
    petHatched: false,
    absent: false,
    completedPets: 0,
    cycleId: `cycle-${id}`,
    revision: 0,
    completionPending: false,
    cycleRulesVersion: 1,
    rewardGrants: [],
    rewardProtection: [],
  });
  let state = {
    students: [initial('one'), initial('two')],
    rules: { maxLevel: 10, finalEnergy: 100, version: 1, completionBadges: 1 },
    records: [] as EvaluationRecord[],
    completed: [] as CompletedPet[],
    rubrics: [
      {
        id: 'r1',
        category: '课堂表现',
        label: '发言',
        score: 2,
        enabled: true,
      },
      {
        id: 'r2',
        category: '课堂表现',
        label: '听讲',
        score: 1,
        enabled: true,
      },
    ],
    rewards: [{ id: 'gift', name: '贴纸', cost: 1, stock: 1, enabled: true }],
    redemptions: [] as unknown[],
  };
  const operations = new Map<string, { payload: string; result: unknown }>();
  let failed = false;
  const db = {
    teacherId: 'teacher',
    write: jest.fn(async (operation, work) => {
      const prior = operation && operations.get(operation.operationId);
      if (prior) {
        if (prior.payload !== JSON.stringify(operation.payload))
          throw new Error('操作编号已用于其他请求');
        return structuredClone(prior.result);
      }
      const before = structuredClone(state);
      try {
        const result = await work(db);
        if (operation)
          operations.set(operation.operationId, {
            payload: JSON.stringify(operation.payload),
            result: structuredClone(result),
          });
        return result;
      } catch (error) {
        state = before;
        throw error;
      }
    }),
    getSettings: async () => ({ ...state.rules }),
    setSettings: async (
      maxLevel: number,
      finalEnergy: number,
      version: number,
      completionBadges = 1,
    ) => (state.rules = { maxLevel, finalEnergy, version, completionBadges }),
    findStudents: async () => structuredClone(state.students),
    findStudentById: async (id: string) =>
      structuredClone(state.students.find((student) => student.id === id)),
    updateStudent: jest.fn(async (id: string, patch: Partial<StudentPet>) => {
      const s = state.students.find((student) => student.id === id)!;
      Object.assign(s, patch);
      return structuredClone(s);
    }),
    findStudentForSync: async (id: string) =>
      structuredClone(state.students.find((student) => student.id === id)),
    canonicalClass: jest.fn(async (id: string) => {
      if (id !== 'class') throw new Error('班级不存在');
      return {
        className: '规范班级',
        students: state.students.map((s) => ({
          id: s.id,
          name: s.name,
          studentNo: s.studentNo,
          group: s.group,
        })),
      };
    }),
    saveStudent: async (s: StudentPet) => {
      const i = state.students.findIndex((item) => item.id === s.id);
      state.students[i] = structuredClone(s);
      return s;
    },
    deleteClassStudentsExcept: jest.fn(async () => undefined),
    findRubrics: async () => state.rubrics,
    findRubricById: async (id: string) =>
      state.rubrics.find((item) => item.id === id),
    createRubric: async (value: (typeof state.rubrics)[number]) => {
      state.rubrics.push(value);
      return value;
    },
    updateRubric: async (
      id: string,
      patch: Partial<(typeof state.rubrics)[number]>,
    ) =>
      Object.assign(
        state.rubrics.find((r) => r.id === id)!,
        Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined),
        ),
      ),
    createRecord: async (record: EvaluationRecord) => {
      if (failed && state.records.length === 1)
        throw new Error('第二条记录失败');
      state.records.push(record);
      return record;
    },
    findRecordById: async (id: string) =>
      state.records.find((record) => record.id === id),
    deleteRecord: async (id: string) => {
      state.records = state.records.filter((record) => record.id !== id);
    },
    findRecords: async () => state.records,
    saveCompleted: async (snapshot: CompletedPet) => {
      if (failed) throw new Error('档案失败');
      state.completed.push(snapshot);
    },
    findCompleted: async () => state.completed,
    findRewards: async () => state.rewards,
    findRewardById: async (id: string) =>
      state.rewards.find((reward) => reward.id === id),
    createReward: async (value: (typeof state.rewards)[number]) => {
      state.rewards.push(value);
      return value;
    },
    updateReward: async (
      id: string,
      patch: Partial<(typeof state.rewards)[number]>,
    ) => Object.assign(state.rewards.find((r) => r.id === id)!, patch),
    createRedemption: async (record: unknown) => {
      if (failed) throw new Error('兑换记录失败');
      state.redemptions.push(record);
      return record;
    },
    findRedemptions: async () => state.redemptions,
  };
  let n = 0;
  const meta = () => ({
    operationId: `test-operation-${++n}`,
    revisions: Object.fromEntries(
      state.students.map((s) => [s.id, s.revision]),
    ),
  });
  return {
    service: new PetPointsService(db as never),
    db,
    state: () => state,
    meta,
    fail: () => {
      failed = true;
    },
  };
}

describe('PetPointsService transactional workflows', () => {
  it('keeps half badges through manual changes, scoring, completion and retry', async () => {
    const t = setup();
    await t.service.adjustTrophies('one', { ...t.meta(), delta: 0.5 });
    expect(t.state().students[0]!.trophies).toBe(0.5);
    await expect(
      t.service.adjustTrophies('one', { ...t.meta(), delta: -1 }),
    ).rejects.toThrow();
    await expect(
      t.service.adjustTrophies('one', { ...t.meta(), delta: 0.25 }),
    ).rejects.toThrow();
    await t.service.updateSettings({
      ...t.meta(),
      expectedVersion: 1,
      completionBadges: 0.5,
    });
    await t.service.adjustScore({
      ...t.meta(),
      studentIds: ['one'],
      delta: 100,
      label: '满级',
    });
    expect(t.state().students[0]!.trophies).toBe(0.5);
    const dto = t.meta();
    await t.service.completePet('one', dto);
    await t.service.completePet('one', dto);
    expect(t.state().students[0]!.trophies).toBe(1);
    expect(t.state().completed[0]!.earnedBadges).toBe(0.5);
    await t.service.adjustTrophies('one', { ...t.meta(), delta: -0.5 });
    expect(t.state().students[0]!.trophies).toBe(0.5);
  });

  it('rolls back completion badges if saving the archive fails', async () => {
    const t = setup();
    await t.service.adjustScore({
      ...t.meta(),
      studentIds: ['one'],
      delta: 100,
      label: '满级',
    });
    const before = structuredClone(t.state());
    t.fail();
    await expect(t.service.completePet('one', t.meta())).rejects.toThrow(
      '档案失败',
    );
    expect(t.state()).toEqual(before);
  });
  it('configures completion badges without issuing retroactive grants and validates quantities', async () => {
    const t = setup();
    for (const completionBadges of [-1, 1.25, 10001]) {
      await expect(
        t.service.updateSettings({
          ...t.meta(),
          expectedVersion: 1,
          completionBadges,
        }),
      ).rejects.toThrow();
    }
    await t.service.adjustScore({
      ...t.meta(),
      studentIds: ['one'],
      delta: 100,
      label: '满级',
    });
    expect(t.state().students[0]!.trophies).toBe(0);
    await t.service.updateSettings({
      ...t.meta(),
      expectedVersion: 1,
      completionBadges: 5,
    });
    expect(t.state().students[0]!.trophies).toBe(0);
    const dto = t.meta();
    await t.service.completePet('one', dto);
    await t.service.completePet('one', dto);
    expect(t.state().students[0]!.trophies).toBe(5);
    expect(t.state().completed).toHaveLength(1);
  });

  it('deletes rewards idempotently, keeps history and never recreates deleted defaults', async () => {
    const t = setup();
    t.state().students[0]!.score = 5;
    await t.service.redeem({ ...t.meta(), studentId: 'one', rewardId: 'gift' });
    const before = structuredClone(t.state().redemptions);
    expect(before).toHaveLength(1);
    const dto = t.meta();
    await t.service.deleteReward('gift', dto);
    await t.service.deleteReward('gift', dto);
    expect(t.state().rewards[0]!.enabled).toBe(false);
    expect((await t.service.overview()).rewards).toEqual([]);
    expect((await t.service.overview()).rewards).toEqual([]);
    expect(t.state().redemptions).toEqual(before);
    await expect(
      t.service.addRewardStock('gift', { ...t.meta(), quantity: 1 }),
    ).rejects.toThrow();
    await expect(
      t.service.redeem({ ...t.meta(), studentId: 'one', rewardId: 'gift' }),
    ).rejects.toThrow();
    await expect(t.service.deleteReward('foreign', t.meta())).rejects.toThrow(
      '奖品不存在',
    );
  });
  it('adds stock once per operation and rejects foreign rewards, invalid quantities and overflow', async () => {
    const t = setup();
    const dto = { ...t.meta(), quantity: 3 };
    await t.service.addRewardStock('gift', dto);
    await t.service.addRewardStock('gift', dto);
    expect(t.state().rewards[0]!.stock).toBe(4);
    for (const quantity of [0, -1, 1.5, 2147483648]) {
      await expect(
        t.service.addRewardStock('gift', { ...t.meta(), quantity }),
      ).rejects.toThrow();
    }
    await expect(
      t.service.addRewardStock('foreign', { ...t.meta(), quantity: 1 }),
    ).rejects.toThrow('奖品不存在');
    t.state().rewards[0]!.stock = 2147483647;
    await expect(
      t.service.addRewardStock('gift', { ...t.meta(), quantity: 1 }),
    ).rejects.toThrow();
    expect(t.state().rewards[0]!.stock).toBe(2147483647);
  });
  it('ignores filtered, empty and forged client rosters while preserving all student state', async () => {
    const t = setup();
    t.state().students[1]!.score = 44;
    const result = await t.service.syncClassStudents({
      classId: 'class',
      className: '伪造',
      students: [],
    });
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ score: 44, className: '规范班级' });
    expect(t.db.deleteClassStudentsExcept).toHaveBeenCalledWith('class', [
      'one',
      'two',
    ]);
    await expect(
      t.service.syncClassStudents({ classId: 'other' }),
    ).rejects.toThrow('班级不存在');
  });
  it('rolls back every student and reward when a later record fails', async () => {
    const t = setup();
    t.fail();
    const before = structuredClone(t.state());
    await expect(
      t.service.evaluate(
        { ...t.meta(), studentIds: ['one', 'two'], rubricIds: ['r1', 'r2'] },
        false,
      ),
    ).rejects.toThrow('第二条记录失败');
    expect(t.state()).toEqual(before);
  });
  it('processes indicators in chosen order, stores clipped deltas and safely undoes them', async () => {
    const t = setup();
    t.state().students[0]!.score = 1;
    await t.service.adjustScore({
      ...t.meta(),
      studentIds: ['one'],
      delta: -2,
      label: '扣分',
    });
    expect(t.state().records[0]).toMatchObject({
      delta: -2,
      scoreDelta: -1,
      petExperienceDelta: 0,
    });
    await t.service.deleteRecord(t.state().records[0]!.id, t.meta());
    expect(t.state().students[0]).toMatchObject({ score: 1, petExperience: 0 });
  });
  it('retries the same operation once and rejects stale revisions, missing metadata and inaccessible students', async () => {
    const t = setup();
    const dto = { ...t.meta(), studentIds: ['one'], delta: 22, label: '加分' };
    await t.service.adjustScore(dto);
    await t.service.adjustScore(dto);
    expect(t.state().records).toHaveLength(1);
    expect(t.state().students[0]!.trophies).toBe(0);
    await expect(
      t.service.adjustScore({ ...dto, operationId: 'other-operation' }),
    ).rejects.toThrow('数据已更新');
    await expect(
      t.service.adjustScore({
        studentIds: ['one'],
        delta: 2,
        label: '旧客户端',
      } as never),
    ).rejects.toThrow('客户端版本');
    await expect(
      t.service.adjustScore({
        ...t.meta(),
        studentIds: ['other'],
        delta: 2,
        label: '越权',
      }),
    ).rejects.toThrow('不存在');
  });
  it('completes once, retains history in both views and scores the next cycle without mutating it', async () => {
    const t = setup();
    await t.service.adjustScore({
      ...t.meta(),
      studentIds: ['one'],
      delta: 102,
      label: '满级',
    });
    const dto = t.meta();
    await t.service.completePet('one', dto);
    await t.service.completePet('one', dto);
    expect(t.state().completed).toHaveLength(1);
    expect(t.state().students[0]).toMatchObject({
      completedPets: 1,
      petExperience: 2,
      score: 102,
      trophies: 1,
      petId: null,
    });
    const snapshot = structuredClone(t.state().completed[0]);
    await t.service.bindPet('one', {
      ...t.meta(),
      petId: 'cloud-bear',
      petName: '新宠',
    });
    await t.service.adjustScore({
      ...t.meta(),
      studentIds: ['one'],
      delta: 20,
      label: '新轮',
    });
    const oldRecord = t.state().records[0]!;
    await t.service.deleteRecord(oldRecord.id, t.meta());
    expect(t.state().students[0]!.petExperience).toBe(22);
    expect(t.state().completed[0]).toEqual(snapshot);
  });
  it('preserves energy on switching, protects reset rewards, persists absence and badge adjustments', async () => {
    const t = setup();
    await t.service.adjustScore({
      ...t.meta(),
      studentIds: ['one'],
      delta: 22,
      label: '升级',
    });
    await t.service.bindPet('one', { ...t.meta(), petId: 'cloud-bear' });
    expect(t.state().students[0]!.petProgress).toBe(22);
    await t.service.resetPet('one', t.meta());
    await t.service.bindPet('one', { ...t.meta(), petId: 'sprout-puff' });
    await t.service.adjustScore({
      ...t.meta(),
      studentIds: ['one'],
      delta: 22,
      label: '重升',
    });
    expect(t.state().students[0]!.trophies).toBe(0);
    for (let i = 0; i < 3; i++)
      await t.service.adjustTrophies('one', { ...t.meta(), delta: 1 });
    await t.service.setAbsence('one', { ...t.meta(), absent: true });
    await t.service.adjustTrophies('one', { ...t.meta(), delta: -1 });
    expect((await t.service.overview()).students[0]).toMatchObject({
      absent: true,
      trophies: 2,
    });
  });
  it('ordinary batch excludes absent students while advanced evaluation includes them explicitly', async () => {
    const t = setup();
    t.state().students[1]!.absent = true;
    const result = await t.service.evaluate(
      { ...t.meta(), studentIds: ['one', 'two'], rubricIds: ['r1', 'r2'] },
      true,
    );
    expect(result.skippedIds).toEqual(['two']);
    expect(t.state().students.map((s) => s.score)).toEqual([3, 0]);
    await t.service.evaluate(
      { ...t.meta(), studentIds: ['two'], rubricIds: ['r2', 'r1'] },
      false,
    );
    expect(t.state().students[1]!.score).toBe(3);
    await expect(
      t.service.evaluate(
        { ...t.meta(), studentIds: ['two'], rubricIds: ['r1'] },
        true,
      ),
    ).rejects.toThrow('没有可评分');
  });
  it('redeems balance without regressing pets and rolls back stock on failure', async () => {
    const t = setup();
    await t.service.adjustScore({
      ...t.meta(),
      studentIds: ['one'],
      delta: 45,
      label: '成长',
    });
    const before = structuredClone(t.state().students[0]);
    t.fail();
    await expect(
      t.service.redeem({ ...t.meta(), studentId: 'one', rewardId: 'gift' }),
    ).rejects.toThrow('兑换记录失败');
    expect(t.state().students[0]).toEqual(before);
    expect(t.state().rewards[0]!.stock).toBe(1);
    const success = setup();
    await success.service.adjustScore({
      ...success.meta(),
      studentIds: ['one'],
      delta: 45,
      label: '成长',
    });
    await success.service.redeem({
      ...success.meta(),
      studentId: 'one',
      rewardId: 'gift',
    });
    expect(success.state().students[0]).toMatchObject({
      score: 44,
      petExperience: 45,
      level: 5,
    });
    await expect(
      success.service.redeem({
        ...success.meta(),
        studentId: 'one',
        rewardId: 'gift',
      }),
    ).rejects.toThrow('库存不足');
  });
  it('does not generate historical rewards on settings changes or rewrite completed snapshots', async () => {
    const t = setup();
    await t.service.adjustScore({
      ...t.meta(),
      studentIds: ['one'],
      delta: 102,
      label: '满级',
    });
    await t.service.completePet('one', t.meta());
    const snapshot = structuredClone(t.state().completed[0]);
    await t.service.updateSettings({
      ...t.meta(),
      maxLevel: 4,
      finalEnergy: 90,
      expectedVersion: 1,
    });
    expect(t.state().completed[0]).toEqual(snapshot);
    expect(t.state().students[0]!.trophies).toBe(1);
  });
  it('rejects invalid rubric, reward, pet, note and unprovable historical rollback inputs', async () => {
    const t = setup();
    await expect(
      t.service.createRubric({
        ...t.meta(),
        category: '课堂表现',
        label: '测试',
        score: 11,
      }),
    ).rejects.toThrow();
    await expect(
      t.service.createReward({ ...t.meta(), name: '', cost: 1, stock: 1 }),
    ).rejects.toThrow();
    await expect(
      t.service.bindPet('one', { ...t.meta(), petId: 'fake' }),
    ).rejects.toThrow();
    // 验证新加入的四系8只宠物均可正常绑定
    const newPetIds = [
      'bamboo-panda',
      'clover-koala',
      'flame-dino',
      'lava-hedgehog',
      'frost-penguin',
      'wave-dolphin',
      'star-owl',
      'galaxy-shiba',
    ];
    for (const petId of newPetIds) {
      await t.service.bindPet('one', { ...t.meta(), petId });
      expect(t.state().students[0]!.petId).toBe(petId);
    }
    await expect(
      t.service.adjustScore({
        ...t.meta(),
        studentIds: ['one'],
        delta: 1,
        label: '长备注',
        note: 'a'.repeat(61),
      }),
    ).rejects.toThrow();
    t.state().records.push({
      id: 'old',
      studentId: 'one',
      label: '旧',
      delta: -2,
      category: '手动调整',
      note: '',
      createdAt: new Date().toISOString(),
    });
    await expect(t.service.deleteRecord('old', t.meta())).rejects.toThrow(
      '缺少实际变化证据',
    );
  });
  it('rechecks absence before validating the stale revision of a skipped ordinary-batch student', async () => {
    const t = setup();
    const dto = { ...t.meta(), studentIds: ['one', 'two'], rubricIds: ['r1'] };
    await t.service.setAbsence('two', { ...t.meta(), absent: true });
    const result = await t.service.evaluate(dto, true);
    expect(result.processedIds).toEqual(['one']);
    expect(result.skippedIds).toEqual(['two']);
  });
  it('clips each indicator in its chosen order instead of merging the net request', async () => {
    const forward = setup();
    forward.state().rubrics[0]!.score = -2;
    forward.state().rubrics[1]!.score = 3;
    await forward.service.evaluate(
      { ...forward.meta(), studentIds: ['one'], rubricIds: ['r1', 'r2'] },
      false,
    );
    expect(forward.state().students[0]).toMatchObject({
      score: 3,
      petExperience: 3,
    });
    expect(forward.state().records.map((record) => record.scoreDelta)).toEqual([
      0, 3,
    ]);
    const reverse = setup();
    reverse.state().rubrics[0]!.score = -2;
    reverse.state().rubrics[1]!.score = 3;
    await reverse.service.evaluate(
      { ...reverse.meta(), studentIds: ['one'], rubricIds: ['r2', 'r1'] },
      false,
    );
    expect(reverse.state().students[0]).toMatchObject({
      score: 1,
      petExperience: 1,
    });
    expect(reverse.state().records.map((record) => record.scoreDelta)).toEqual([
      3, -2,
    ]);
  });
});
