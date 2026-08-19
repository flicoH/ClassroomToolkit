import { PetPointsService } from './pet-points.service';

describe('PetPointsService', () => {
  it('syncs classroom students into pet points while preserving existing score state', async () => {
    const existing = {
      id: '2026001',
      name: '旧姓名',
      studentNo: '2026001',
      classId: 'old-class',
      className: '旧班级',
      group: '旧组',
      score: 12,
      maxScore: 30,
      trophies: 1,
      level: 2,
      stage: '成长形态' as const,
      petProgress: 10,
      petHatched: true,
      absent: false,
      completedPets: 0,
    };
    const database = {
      deleteClassStudentsExcept: jest.fn().mockResolvedValue(undefined),
      findStudentById: jest.fn().mockResolvedValue(existing),
      saveStudent: jest.fn().mockImplementation(async (student) => student),
    };
    const service = new PetPointsService(database as never);

    const synced = await service.syncClassStudents({
      classId: 'grade-1',
      className: '一年级',
      students: [
        { id: '2026001', name: '周杰伦', studentNo: '2026001', group: '一组' },
      ],
    });

    expect(database.deleteClassStudentsExcept).toHaveBeenCalledWith('grade-1', [
      '2026001',
    ]);
    expect(database.saveStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '2026001',
        name: '周杰伦',
        classId: 'grade-1',
        className: '一年级',
        group: '一组',
        score: 12,
        petProgress: 10,
      }),
    );
    expect(synced[0].score).toBe(12);
  });

  it('adjusts scores in the backend and writes evaluation records', async () => {
    const student = {
      id: '2026001',
      name: '周杰伦',
      studentNo: '2026001',
      classId: 'grade-1',
      className: '一年级',
      group: '一组',
      score: 3,
      maxScore: 30,
      trophies: 0,
      level: 1,
      stage: '初始形态' as const,
      petProgress: 0,
      petHatched: false,
      absent: false,
      completedPets: 0,
    };
    const database = {
      findStudentById: jest.fn().mockResolvedValue(student),
      updateStudent: jest
        .fn()
        .mockImplementation(async (_studentId, patch) => ({
          ...student,
          ...patch,
        })),
      createRecord: jest.fn().mockImplementation(async (record) => record),
    };
    const service = new PetPointsService(database as never);

    const changed = await service.adjustScore({
      studentIds: ['2026001'],
      delta: 5,
      label: '积极发言',
      category: '课堂表现',
      note: '举手回答',
    });

    expect(database.updateStudent).toHaveBeenCalledWith(
      '2026001',
      expect.objectContaining({
        score: 8,
        petProgress: 5,
        petHatched: true,
      }),
    );
    expect(database.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^record-/),
        studentId: '2026001',
        label: '积极发言',
        delta: 5,
        petDelta: 5,
        note: '举手回答',
      }),
    );
    expect(changed[0].score).toBe(8);
  });

  it('deletes evaluation records through the backend and rolls student scores back', async () => {
    const student = {
      id: '2026001',
      name: '周杰伦',
      studentNo: '2026001',
      classId: 'grade-1',
      className: '一年级',
      group: '一组',
      score: 8,
      maxScore: 30,
      trophies: 0,
      level: 1,
      stage: '初始形态' as const,
      petProgress: 5,
      petHatched: true,
      absent: false,
      completedPets: 0,
    };
    const record = {
      id: 'record-1',
      studentId: '2026001',
      category: '手动调整' as const,
      label: 'Codex自动测试加分',
      delta: 5,
      petDelta: 5,
      note: '',
      createdAt: new Date().toISOString(),
    };
    const database = {
      findRecordById: jest.fn().mockResolvedValue(record),
      findStudentById: jest.fn().mockResolvedValue(student),
      updateStudent: jest
        .fn()
        .mockResolvedValue({ ...student, score: 3, petProgress: 0 }),
      deleteRecord: jest.fn().mockResolvedValue(true),
    };
    const service = new PetPointsService(database as never);

    await expect(service.deleteRecord('record-1')).resolves.toEqual({
      deleted: true,
    });
    expect(database.updateStudent).toHaveBeenCalledWith(
      '2026001',
      expect.objectContaining({
        score: 3,
        petProgress: 0,
        petHatched: false,
      }),
    );
    expect(database.deleteRecord).toHaveBeenCalledWith('record-1');
  });
});
