import { SeatingChartService } from './seating-chart.service';

describe('SeatingChartService', () => {
  it('creates a chart from backend classroom students and assigns initial seats', async () => {
    const database = {
      save: jest.fn().mockImplementation(async (chart) => chart),
    };
    const service = new SeatingChartService(database as never);

    const chart = await service.create({
      className: '一年级',
      rows: 2,
      cols: 2,
      students: [
        { id: '2026001', name: '周杰伦', studentNo: '2026001' },
        { id: '2026002', name: '林俊杰', studentNo: '2026002' },
      ],
    });

    expect(database.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^seating-/),
        className: '一年级',
        rows: 2,
        cols: 2,
        students: [
          { id: '2026001', name: '周杰伦', studentNo: '2026001' },
          { id: '2026002', name: '林俊杰', studentNo: '2026002' },
        ],
      }),
    );
    expect(chart.seats.map((seat) => seat.studentId)).toEqual([
      '2026001',
      '2026002',
      null,
      null,
    ]);
  });

  it('keeps duplicate legacy student numbers from colliding in seating snapshots', async () => {
    const database = {
      save: jest.fn().mockImplementation(async (chart) => chart),
    };
    const service = new SeatingChartService(database as never);

    await service.create({
      className: '一年级',
      rows: 2,
      cols: 2,
      students: [
        { id: 'student-a', name: '张三', studentNo: '1001' },
        { id: 'student-b', name: '李四', studentNo: '1001' },
      ],
    });

    expect(database.save).toHaveBeenCalledWith(
      expect.objectContaining({
        students: [
          { id: 'student-a', name: '张三', studentNo: '1001' },
          { id: 'student-b', name: '李四', studentNo: '1001' },
        ],
      }),
    );
  });

  it('rebuilds empty legacy seats when syncing a classroom', async () => {
    const database = {
      findById: jest.fn().mockResolvedValue({
        id: 'seating-1',
        className: '一年级',
        rows: 4,
        cols: 4,
        students: [],
        seats: [],
      }),
      save: jest.fn().mockImplementation(async (chart) => chart),
    };
    const service = new SeatingChartService(database as never);

    const chart = await service.syncClassroom('seating-1', {
      className: '一年级',
      students: [],
    });

    expect(chart.seats).toHaveLength(16);
    expect(chart.seats[0]).toEqual({
      id: 'seat-0-0',
      row: 0,
      col: 0,
      studentId: null,
    });
  });
});
