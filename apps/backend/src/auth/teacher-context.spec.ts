import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TeacherContext } from './teacher-context';
import { SemesterReportsService } from '../semester-reports/semester-reports.service';
describe('account ownership and report configuration permissions', () => {
  const child = () =>
    new TeacherContext({
      teacher: {
        id: 'child',
        ownerAccountId: 'owner',
        name: '李老师',
        accountType: 'sub',
      },
    } as never);
  it('separates owner and actor and preserves legacy main ownership', () => {
    expect(child().teacherId).toBe('owner');
    expect(child().actorAccountId).toBe('child');
    expect(child().actorDisplayName).toBe('李老师');
    expect(() => child().requireMainAccount()).toThrow(ForbiddenException);
    expect(
      new TeacherContext({ teacher: { id: 'old' } } as never).teacherId,
    ).toBe('old');
    expect(() => new TeacherContext({} as never).teacherId).toThrow(
      UnauthorizedException,
    );
  });
  it('blocks all report setup writes before touching repositories but allows shared reads', async () => {
    const subjects = { find: jest.fn().mockResolvedValue([]) };
    const terms = { find: jest.fn().mockResolvedValue([]) };
    const service = new SemesterReportsService(
      terms as never,
      subjects as never,
      undefined!,
      undefined!,
      undefined!,
      undefined!,
      undefined!,
      undefined!,
      child(),
    );
    await expect(service.createTerm({})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.createSubject({ name: '数学' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.updateSubjectPerformance('math', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.listSubjects();
    await service.listTerms();
    expect(subjects.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teacherId: 'owner', enabled: true } }),
    );
    expect(terms.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teacherId: 'owner' } }),
    );
  });
});
