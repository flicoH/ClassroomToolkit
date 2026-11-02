import { SemesterReportsService } from './semester-reports.service';
import type { PetStudentEntity } from '../pet-points/entities/pet-student.entity';

describe('report student identity compatibility', () => {
  function setup() {
    const logicalId = 'long-' + 'a'.repeat(58) + '1';
    const hashed = {
      id: 'pet-' + 'b'.repeat(60),
      logicalId,
      teacherId: 'teacher',
    } as PetStudentEntity;
    const legacy = {
      id: 'teacher:old-student',
      logicalId: 'canonical-old',
      teacherId: 'teacher',
    } as PetStudentEntity;
    const find = jest.fn().mockResolvedValue([hashed, legacy]);
    const service = Object.assign(
      Object.create(SemesterReportsService.prototype) as SemesterReportsService,
      { students: { find }, teacher: { teacherId: 'teacher' } },
    );
    return { service, find, hashed, legacy, logicalId };
  }
  it('resolves full logical IDs, hashed storage IDs and existing report references to the same owned student', async () => {
    const t = setup();
    expect(
      await t.service['findStudents']([
        t.logicalId,
        t.hashed.id,
        'canonical-old',
        'old-student',
        t.legacy.id,
      ]),
    ).toEqual([t.hashed, t.hashed, t.legacy, t.legacy, t.legacy]);
    expect(t.find).toHaveBeenCalledWith({ where: { teacherId: 'teacher' } });
  });
  it('rejects an unknown identity rather than guessing a different student', async () => {
    const t = setup();
    await expect(
      t.service['findStudents'](['unowned-identity']),
    ).rejects.toThrow('学生不存在');
  });

  it('provisions newly added student from studentProfiles when missing from pet students', async () => {
    const t = setup();
    const newStudentProfile = {
      id: 'new-stu-uuid',
      classroomId: 'cls-1',
      name: '新学生',
      studentNo: '202601',
      groupName: '第一组',
      teacherId: 'teacher',
    };
    const mockClassroom = {
      id: 'cls-1',
      name: '二年级三班',
      teacherId: 'teacher',
    };
    const studentProfiles = {
      findOne: jest.fn().mockResolvedValue(newStudentProfile),
      manager: {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue(mockClassroom),
        }),
      },
    };
    const createMock = jest.fn((props) => ({ ...props }));
    const saveMock = jest.fn((props) => Promise.resolve({ ...props }));
    Object.assign(t.service, {
      studentProfiles,
      students: {
        find: t.find,
        create: createMock,
        save: saveMock,
      },
    });

    const result = await t.service['findStudents'](['new-stu-uuid']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('新学生');
    expect(result[0].className).toBe('二年级三班');
    expect(result[0].rosterActive).toBe(true);
    expect(saveMock).toHaveBeenCalled();
  });

  it('reuses existing pet student with score and avoids duplicate creation when student profile matches class and studentNo/name', async () => {
    const existingPet = {
      id: 'teacher:cls-1:202602',
      logicalId: 'cls-1:202602',
      teacherId: 'teacher',
      classId: 'cls-1',
      studentNo: '202602',
      name: '已有学生',
      score: 25,
      rosterActive: true,
    } as PetStudentEntity;

    const find = jest.fn().mockResolvedValue([existingPet]);
    const service = Object.assign(
      Object.create(SemesterReportsService.prototype) as SemesterReportsService,
      { teacher: { teacherId: 'teacher' } },
    );

    const profile = {
      id: 'profile-uuid-2',
      classroomId: 'cls-1',
      name: '已有学生',
      studentNo: '202602',
      teacherId: 'teacher',
    };

    const studentProfiles = {
      findOne: jest.fn().mockResolvedValue(profile),
      manager: {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest
            .fn()
            .mockResolvedValue({ id: 'cls-1', name: '二年级三班' }),
        }),
      },
    };
    const createMock = jest.fn();
    const saveMock = jest.fn();
    Object.assign(service, {
      studentProfiles,
      students: {
        find,
        create: createMock,
        save: saveMock,
      },
    });

    const result = await service['findStudents'](['profile-uuid-2']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('teacher:cls-1:202602');
    expect(result[0].score).toBe(25);
    expect(result[0].name).toBe('已有学生');
    expect(createMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('gathers candidate IDs across teacher prefix, logical ID and colon suffix for evaluation records', async () => {
    const service = Object.assign(
      Object.create(SemesterReportsService.prototype) as SemesterReportsService,
      { teacher: { teacherId: 'teacher' } },
    );

    const candidates = service['getStudentCandidateIds']({
      id: 'teacher:cls-1:uuid-99',
      logicalId: 'uuid-99',
      classId: 'cls-1',
      studentNo: '10',
    });

    expect(candidates).toContain('teacher:cls-1:uuid-99');
    expect(candidates).toContain('cls-1:uuid-99');
    expect(candidates).toContain('uuid-99');
    expect(candidates).toContain('teacher:uuid-99');
    expect(candidates).toContain('cls-1:10');
    expect(candidates).toContain('teacher:cls-1:10');
  });
});
