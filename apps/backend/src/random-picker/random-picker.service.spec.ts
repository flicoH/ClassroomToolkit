import { RandomPickerService } from './random-picker.service';

describe('RandomPickerService', () => {
  it('picks through the backend and stores a history record', async () => {
    const students = [
      { id: '2026001', name: '周杰伦', studentNo: '2026001' },
      { id: '2026002', name: '林俊杰', studentNo: '2026002' },
    ];
    const database = {
      saveHistory: jest.fn().mockImplementation(async (history) => history),
    };
    const studentsService = {
      findClassroom: jest.fn().mockResolvedValue({
        id: 'grade-1',
        name: '一年级',
        groups: [],
        students,
      }),
    };
    const service = new RandomPickerService(
      database as never,
      studentsService as never,
    );

    const history = await service.pick({
      classId: 'grade-1',
      selectedCount: 5,
    });

    expect(studentsService.findClassroom).toHaveBeenCalledWith('grade-1');
    expect(database.saveHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^pick-/),
        classId: 'grade-1',
        className: '一年级',
        selectedCount: 2,
        students: expect.arrayContaining(students),
        createdAt: expect.any(String),
      }),
    );
    expect(history.students).toHaveLength(2);
  });

  it('lists classes from student management so added students survive relogin', async () => {
    const database = {
      findHistories: jest.fn(),
      saveHistory: jest.fn(),
    };
    const studentsService = {
      findClassrooms: jest.fn().mockResolvedValue([
        {
          id: 'class-1',
          name: '一年级',
          groups: ['一组'],
          students: [{ id: 's1', name: '张三', studentNo: '1001' }],
        },
      ]),
    };
    const service = new RandomPickerService(
      database as never,
      studentsService as never,
    );

    await expect(service.findClasses()).resolves.toEqual([
      {
        id: 'class-1',
        name: '一年级',
        groups: ['一组'],
        students: [{ id: 's1', name: '张三', studentNo: '1001' }],
      },
    ]);
  });
});
