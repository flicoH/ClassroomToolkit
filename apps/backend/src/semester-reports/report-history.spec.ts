import {
  captureReportVersion,
  historyEventDto,
  reportVersionToken,
} from './report-history';
import type {
  SemesterReportEntity,
  ReportEventEntity,
} from './semester-report.entity';

describe('report history', () => {
  const row = () =>
    ({
      content: {
        summary: '原寄语',
        courseOverview: '课程',
        strengths: [],
        areasToImprove: [],
        homeSuggestions: [],
        limitations: [],
        classroomPhoto: 'photo',
      },
      snapshot: { classroomPhoto: 'photo' },
      courseScope: '第一课',
    }) as unknown as SemesterReportEntity;
  it('labels legacy/unknown operations in Chinese without inventing recoverable content', () => {
    expect(
      historyEventDto({
        action: 'draft-edited',
        details: null,
      } as ReportEventEntity),
    ).toMatchObject({
      label: '编辑报告草稿',
      canRestoreBefore: false,
      canRestoreAfter: false,
    });
    expect(
      historyEventDto({
        action: 'future-action',
        details: { token: 'secret' },
      } as unknown as ReportEventEntity),
    ).toMatchObject({ label: '其他报告操作', changes: [] });
  });
  it('captures independent versions without duplicate photo bytes and shows changed prose and mastery', () => {
    const report = row();
    report.content!.learningContents = [
      {
        id: 'one',
        section: '第一课',
        text: '认字',
        mastery: 'unassessed',
        sourceRefs: ['teacher-review'],
      },
    ];
    const before = captureReportVersion(report);
    report.content!.summary = '新寄语';
    (
      report.content!.learningContents as Array<Record<string, unknown>>
    )[0]!.mastery = 'mastered';
    const after = captureReportVersion(report);
    expect(before.content?.summary).toBe('原寄语');
    expect(before.content).not.toHaveProperty('classroomPhoto');
    expect(before.snapshot.classroomPhoto).toBe('photo');
    const result = historyEventDto({
      action: 'draft-edited',
      details: { revision: { schema: 1, before, after } },
    } as unknown as ReportEventEntity);
    expect(result).toMatchObject({
      canRestoreBefore: true,
      canRestoreAfter: true,
    });
    expect(result.changes).toEqual(
      expect.arrayContaining([
        { field: '老师寄语', before: '原寄语', after: '新寄语' },
        expect.objectContaining({
          before: expect.stringContaining('待评价'),
          after: expect.stringContaining('已掌握'),
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('unassessed');
    expect(JSON.stringify(result)).not.toContain('sourceRefs');
    expect(JSON.stringify(result)).not.toContain('photo');
  });
  it('shows manual content changes without mastery labels or old ratings', () => {
    const report = row();
    report.content!.learningContents = [
      {
        id: 'manual-one',
        section: '科学 · 教师填写',
        text: '观察叶子',
        mastery: 'mastered',
        sourceRefs: ['teacher-course:science'],
      },
    ];
    const before = captureReportVersion(report);
    (
      report.content!.learningContents as Array<Record<string, unknown>>
    )[0]!.text = '观察叶子和根';
    const after = captureReportVersion(report);
    const detail = historyEventDto({
      action: 'draft-edited',
      details: { revision: { schema: 1, before, after } },
    } as unknown as ReportEventEntity);
    expect(detail.changes).toContainEqual({
      field: '学习内容',
      before: '科学 · 教师填写\n观察叶子',
      after: '科学 · 教师填写\n观察叶子和根',
    });
    expect(JSON.stringify(detail)).not.toContain('掌握');
    expect(before.content?.learningContents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mastery: 'mastered' }),
      ]),
    );
  });
  it('invalidates recovery tokens when another tab publishes the report', () => {
    const report = row();
    report.status = 'draft';
    const token = reportVersionToken(report);
    report.status = 'published';
    report.publishedAt = new Date('2026-10-11T00:00:00Z');
    expect(reportVersionToken(report)).not.toBe(token);
  });
  it('uses a stable token and rejects malformed revision metadata', () => {
    const report = row();
    const first = reportVersionToken(report);
    report.content = { ...report.content, summary: '另一个编辑' };
    expect(reportVersionToken(report)).not.toBe(first);
    expect(
      historyEventDto({
        action: 'draft-edited',
        details: { revision: { schema: 99, before: {}, after: {} } },
      } as unknown as ReportEventEntity).canRestoreAfter,
    ).toBe(false);
  });
});
