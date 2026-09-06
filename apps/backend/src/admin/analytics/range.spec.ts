import { dateRange, pageQuery } from './range';
describe('admin reporting ranges', () => {
  it('uses Shanghai midnight and an exclusive end with equal previous period', () => {
    const r = dateRange({ start: '2025-01-02', end: '2025-01-03' });
    expect(r.from).toBe('2025-01-01 16:00:00.000');
    expect(r.to).toBe('2025-01-03 16:00:00.000');
    expect(r.previousFrom).toBe('2024-12-30 16:00:00.000');
    expect(r.days).toEqual(['2025-01-02', '2025-01-03']);
  });
  it.each([
    ['2025-02-30', '2025-03-01'],
    ['2025-03-02', '2025-03-01'],
    ['2020-01-01', '2025-03-01'],
    ['invalid', '2025-03-01'],
  ])('rejects invalid ranges %s %s', (start, end) => {
    expect(() => dateRange({ start, end })).toThrow();
  });
  it('bounds pagination', () => {
    expect(pageQuery({ page: '3', pageSize: '20' }).offset).toBe(40);
    expect(() => pageQuery({ pageSize: '100000' })).toThrow();
    expect(() => pageQuery({ page: '-1' })).toThrow();
  });
});
