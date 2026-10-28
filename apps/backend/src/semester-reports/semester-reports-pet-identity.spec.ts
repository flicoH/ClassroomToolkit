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
});
