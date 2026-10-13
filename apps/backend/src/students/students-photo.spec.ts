import { StudentsService } from './students.service';

describe('student photo ownership and preservation', () => {
  function setup() {
    const student = {
      id: 'class:one',
      name: '小明',
      studentNo: '1',
      gender: '',
    };
    const database = {
      findClassroom: jest
        .fn()
        .mockResolvedValue({ id: 'class', students: [student], groups: [] }),
      setStudentPhoto: jest.fn(async (_classId, _studentId, photo) => ({
        ...student,
        photo,
      })),
      saveClassroom: jest.fn(async (row) => row),
    };
    const service = new StudentsService(
      database as never,
    ) as StudentsService & {
      setStudentPhoto(
        classId: string,
        studentId: string,
        file?: { buffer: Buffer; mimetype: string; size: number },
      ): Promise<unknown>;
    };
    return { service, database };
  }
  it('removes only the owned student photo through its dedicated write', async () => {
    const { service, database } = setup();
    await expect(
      service.setStudentPhoto('class', 'class:one'),
    ).resolves.toMatchObject({ photo: null });
    expect(database.setStudentPhoto).toHaveBeenCalledWith(
      'class',
      'class:one',
      null,
    );
    expect(database.saveClassroom).not.toHaveBeenCalled();
  });
  it('rejects another teacher classroom or an unknown student before writing', async () => {
    const { service, database } = setup();
    database.findClassroom.mockResolvedValueOnce(undefined);
    await expect(
      service.setStudentPhoto('foreign', 'class:one'),
    ).rejects.toThrow('班级不存在');
    await expect(service.setStudentPhoto('class', 'missing')).rejects.toThrow(
      '学生不存在',
    );
    expect(database.setStudentPhoto).not.toHaveBeenCalled();
  });
  it('does not let ordinary student edits inject a photo', async () => {
    const { service, database } = setup();
    const updated = await service.updateStudent('class', 'class:one', {
      name: '新姓名',
      photo: 'https://untrusted.test',
    } as never);
    expect(updated).not.toHaveProperty('photo', 'https://untrusted.test');
    expect(database.setStudentPhoto).not.toHaveBeenCalled();
  });
});
