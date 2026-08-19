import { StudentsService } from './students.service';

describe('StudentsService', () => {
  it('filters classroom students by group and query, then sorts by name', async () => {
    const database = {
      findClassroom: jest.fn().mockResolvedValue({
        id: 'grade-1',
        name: '一年级',
        groups: ['一组', '二组'],
        students: [
          {
            id: '2026002',
            name: '林俊杰',
            studentNo: '2026002',
            gender: '男',
            group: '二组',
          },
          {
            id: '2026001',
            name: '周杰伦',
            studentNo: '2026001',
            gender: '男',
            group: '一组',
          },
          {
            id: '2026003',
            name: '孙燕姿',
            studentNo: '2026003',
            gender: '女',
            group: '二组',
          },
        ],
      }),
    };
    const service = new StudentsService(database as never);

    const classroom = await service.findClassroom('grade-1', {
      group: '二组',
      query: '林',
      sort: '姓名排序',
    });

    expect(database.findClassroom).toHaveBeenCalledWith('grade-1');
    expect(classroom.students).toEqual([
      {
        id: '2026002',
        name: '林俊杰',
        studentNo: '2026002',
        gender: '男',
        group: '二组',
      },
    ]);
  });
});
