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
});
