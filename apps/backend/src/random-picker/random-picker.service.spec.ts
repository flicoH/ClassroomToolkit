import { RandomPickerService } from './random-picker.service';

describe('RandomPickerService', () => {
  it('picks through the backend and stores a history record', async () => {
    const students = [
      { id: '2026001', name: '周杰伦', studentNo: '2026001' },
      { id: '2026002', name: '林俊杰', studentNo: '2026002' },
    ];
    const database = {
      findClass: jest
        .fn()
        .mockResolvedValue({ id: 'grade-1', name: '一年级', students }),
      saveHistory: jest.fn().mockImplementation(async (history) => history),
    };
    const service = new RandomPickerService(database as never);

    const history = await service.pick({
      classId: 'grade-1',
      selectedCount: 5,
    });

    expect(database.findClass).toHaveBeenCalledWith('grade-1');
    expect(database.saveHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^pick-/),
        classId: 'grade-1',
        selectedCount: 2,
        students: expect.arrayContaining(students),
        createdAt: expect.any(String),
      }),
    );
    expect(history.students).toHaveLength(2);
  });
});
