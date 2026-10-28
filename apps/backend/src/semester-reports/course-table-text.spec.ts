import { courseTableText } from './course-table-text';
import { detectCourseUnits } from './course-scope';

const header = '课时\n课程\n目标及内容\n重难点及技巧策略\n家庭活动建议';

describe('flattened cloud course tables', () => {
  it('recovers titles without inventing displaced goals, and retains stored input', () => {
    const source = `${header}\n1.\n目标甲\n01\n课程甲\n作业甲\n02\n课程乙\n目标乙`;
    expect(courseTableText(source)).toContain('|1|课程甲|||');
    expect(courseTableText(source)).not.toContain('作业甲');
    expect(source).toContain('作业甲');
    expect(detectCourseUnits(source)).toEqual([
      '第1课时 · 课程甲',
      '第2课时 · 课程乙',
    ]);
  });

  it.each([
    `课时\n课程\n01\n课程甲\n02\n课程乙`,
    `${header}\n01\n课程甲`,
    `${header}\n01\n课程甲\n03\n课程丙`,
    `${header}\n300\n课程甲\n301\n课程乙`,
    `${header}\n01\n掌握字母\n02\n学会书写`,
  ])('leaves incomplete or ambiguous flattened grids unchanged', (source) => {
    expect(courseTableText(source)).toBe(source);
  });

  it('ends a flattened grid at page markers and subsequent section boundaries', () => {
    const source = `${header}\n01\n课程甲\n02\n课程乙\n【PDF第7页】\n四、附件\n01\n文件甲\n02\n文件乙`;
    expect(detectCourseUnits(source)).toEqual([
      '第1课时 · 课程甲',
      '第2课时 · 课程乙',
    ]);
    expect(courseTableText(source)).toContain('四、附件\n01\n文件甲');
  });
});
