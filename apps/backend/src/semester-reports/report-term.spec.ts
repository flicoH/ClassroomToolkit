/// <reference types="jest" />
// 通过存储边界替身验证停用与教师隔离，保留真实服务方法。
import { SemesterReportsService } from './semester-reports.service';

// 仅替换存储依赖，保留学期读取与停用的真实实现。
function setup(found = true) {
  const term = { id: 'term', name: '秋季', enabled: true };
  const terms = {
    update: jest.fn(
      (
        where: { id: string; teacherId: string },
        patch: { enabled: boolean },
      ) => {
        if (!found || where.id !== term.id || where.teacherId !== 'teacher')
          return Promise.resolve({ affected: 0 });
        Object.assign(term, patch);
        return Promise.resolve({ affected: 1 });
      },
    ),
    find: jest.fn(() => Promise.resolve(term.enabled ? [term] : [])),
    findOne: jest.fn((options: { where: { enabled?: boolean } }) =>
      Promise.resolve(
        options.where.enabled === true && !term.enabled ? null : term,
      ),
    ),
  };
  const service = Object.create(
    SemesterReportsService.prototype,
  ) as SemesterReportsService;
  Object.assign(service, { terms, teacher: { teacherId: 'teacher' } });
  const internal = service as unknown as {
    requireTerm: (id: string, allowDisabled?: boolean) => Promise<unknown>;
  };
  return { service, internal, terms, term };
}

describe('report term deletion', () => {
  it('hides a deleted term from creation while preserving historical term lookup and repeated deletion', async () => {
    const { service, internal, terms, term } = setup();
    await expect(service.deleteTerm('term')).resolves.toEqual({
      deleted: true,
    });
    expect(terms.update).toHaveBeenCalledWith(
      { id: 'term', teacherId: 'teacher' },
      { enabled: false },
    );
    await expect(service.listTerms()).resolves.toEqual([]);
    expect(terms.find).toHaveBeenCalledWith({
      where: { teacherId: 'teacher', enabled: true },
      order: { startDate: 'DESC' },
    });
    await expect(internal.requireTerm('term')).rejects.toThrow('学期不存在');
    await expect(internal.requireTerm('term', true)).resolves.toBe(term);
    await expect(service.deleteTerm('term')).resolves.toEqual({
      deleted: true,
    });
  });
  it('rejects another teacher or a missing term', async () => {
    const { service } = setup(false);
    await expect(service.deleteTerm('other')).rejects.toThrow('学期不存在');
  });
  it('propagates storage failure without claiming deletion', async () => {
    const { service, terms } = setup();
    terms.update.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.deleteTerm('term')).rejects.toThrow(
      'database unavailable',
    );
  });
});

describe('semester subject deletion', () => {
  it('only disables the current teacher subject without deleting associated records', async () => {
    const subjects = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const service = Object.create(
      SemesterReportsService.prototype,
    ) as SemesterReportsService;
    Object.assign(service, { subjects, teacher: { teacherId: 'teacher' } });
    await expect(service.deleteSubject('subject')).resolves.toEqual({
      deleted: true,
    });
    expect(subjects.update).toHaveBeenCalledWith(
      { id: 'subject', teacherId: 'teacher' },
      { enabled: false },
    );
    await expect(service.deleteSubject('subject')).resolves.toEqual({
      deleted: true,
    });
    subjects.update.mockResolvedValueOnce({ affected: 0 });
    await expect(service.deleteSubject('other-teacher')).rejects.toThrow(
      '学科不存在',
    );
    subjects.update.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.deleteSubject('subject')).rejects.toThrow(
      'database unavailable',
    );
  });
});

describe('semester subject term binding', () => {
  it('binds subject to a term on creation and filters by termId with legacy fallback', async () => {
    const terms = {
      count: jest.fn().mockResolvedValue(1),
      findOne: jest.fn().mockResolvedValue({ id: 'term-1', enabled: true }),
    };
    const subjects = {
      create: jest.fn((val) => val),
      save: jest.fn(async (val) => val),
      find: jest.fn().mockResolvedValue([
        {
          id: 'sub-1',
          name: '英语',
          termId: 'term-1',
          performanceConfig: null,
        },
      ]),
    };
    const service = Object.create(
      SemesterReportsService.prototype,
    ) as SemesterReportsService;
    Object.assign(service, {
      terms,
      subjects,
      teacher: { teacherId: 'teacher' },
    });

    await expect(service.createSubject({ name: '英语' })).rejects.toThrow(
      '请选择所属学期',
    );

    const created = await service.createSubject({
      name: '英语',
      termId: 'term-1',
    });
    expect(created.termId).toBe('term-1');
    expect(terms.findOne).toHaveBeenCalledWith({
      where: { id: 'term-1', teacherId: 'teacher', enabled: true },
    });

    const list = await service.listSubjects({ termId: 'term-1' });
    expect(list).toHaveLength(1);
    expect(subjects.find).toHaveBeenCalledWith({
      where: [
        { teacherId: 'teacher', enabled: true, termId: 'term-1' },
        { teacherId: 'teacher', enabled: true, termId: expect.anything() },
      ],
      order: { name: 'ASC' },
    });
  });
});
