import { Repository } from 'typeorm';
import { TeacherContext } from '../auth/teacher-context';
import { SemesterReportsService } from './semester-reports.service';
import { ReportSubjectEntity } from './semester-report.entity';
import {
  defaultPerformanceConfig,
  parsePerformanceConfig,
} from './performance-config';

describe('subject classroom performance configuration', () => {
  function setup() {
    const subjects = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new SemesterReportsService(
      undefined!,
      subjects as unknown as Repository<ReportSubjectEntity>,
      undefined!,
      undefined!,
      undefined!,
      undefined!,
      undefined!,
      undefined!,
      { teacherId: 'teacher' } as TeacherContext,
      undefined!,
    );
    return { service, subjects };
  }
  it('creates four defaults and supplies defaults for existing subjects without writing to them', async () => {
    const { service, subjects } = setup();
    expect(
      (await service.createSubject({ name: '数学' })).performanceConfig,
    ).toEqual(defaultPerformanceConfig());
    subjects.find.mockResolvedValue([{ id: 'old', performanceConfig: null }]);
    expect((await service.listSubjects())[0].performanceConfig).toEqual(
      defaultPerformanceConfig(),
    );
    expect(subjects.save).toHaveBeenCalledTimes(1);
  });
  it('saves changed default options and additional fields only for the authenticated teacher', async () => {
    const { service, subjects } = setup();
    subjects.findOne.mockResolvedValue({ id: 'math', teacherId: 'teacher' });
    const config = defaultPerformanceConfig();
    config[0].options = [' 完成挑战 ', '需要支持'];
    config.push({ label: '同伴协作', options: ['主动协作', '需要引导'] });
    const result = await service.updateSubjectPerformance('math', {
      performanceConfig: config,
    });
    expect(subjects.findOne).toHaveBeenCalledWith({
      where: { id: 'math', teacherId: 'teacher', enabled: true },
    });
    expect(result.performanceConfig[0].options).toEqual([
      '完成挑战',
      '需要支持',
    ]);
    expect(result.performanceConfig[4].label).toBe('同伴协作');
    subjects.findOne.mockResolvedValue(null);
    await expect(
      service.updateSubjectPerformance('foreign', {
        performanceConfig: config,
      }),
    ).rejects.toThrow('学科不存在');
    expect(subjects.save).toHaveBeenCalledTimes(1);
  });
  it.each([
    null,
    [],
    [{}],
    [...defaultPerformanceConfig(), defaultPerformanceConfig()[0]],
    defaultPerformanceConfig().map((field) => ({ ...field, options: [] })),
    defaultPerformanceConfig().map((field) => ({
      ...field,
      options: ['重复', '重复'],
    })),
    defaultPerformanceConfig().map((field) => ({
      ...field,
      options: ['x'.repeat(101)],
    })),
    Array.from({ length: 13 }, (_, index) => ({
      label: String(index),
      options: ['好'],
    })),
  ])('rejects malformed or excessive configuration: %j', (value) => {
    expect(() => parsePerformanceConfig(value)).toThrow('课堂表现需要');
  });
  it('keeps a failed save from reporting success', async () => {
    const { service, subjects } = setup();
    subjects.findOne.mockResolvedValue({ id: 'math' });
    subjects.save.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.updateSubjectPerformance('math', {
        performanceConfig: defaultPerformanceConfig(),
      }),
    ).rejects.toThrow('database unavailable');
  });
});
