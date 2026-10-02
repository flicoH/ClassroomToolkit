import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chooseCourseUnitCandidates,
  detectCourseUnits,
  extractLearningContents,
  selectCoursePages,
} from './course-scope';

type FormatFixture = {
  kind: 'pinyin' | 'reading' | 'handwriting' | 'health';
  pages: Array<{ page: number; text: string }>;
};

// These are only the structural table columns and a few short goals from the
// four PDFs accepted in September 2026, not copies of the complete courseware.
const formats = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures/uploaded-course-formats.json'),
    'utf8',
  ),
) as FormatFixture[];

function course(kind: FormatFixture['kind']) {
  const fixture = formats.find((item) => item.kind === kind);
  if (!fixture) throw new Error(`缺少 ${kind} 的 PDF 格式样本`);
  const document = {
    id: kind,
    fileName: `${kind}.pdf`,
    confirmedUnits: [],
    sourcePages: fixture.pages,
  };
  const text = fixture.pages
    .map((page) => `【PDF第${page.page}页】\n${page.text}`)
    .join('\n\n');
  return { document, text, units: detectCourseUnits(text) };
}

describe('uploaded course PDF format contract', () => {
  it.each([
    ['pinyin', 21, 81],
    ['reading', 18, 80],
    ['handwriting', 4, 18],
    ['health', 11, 21],
  ] as const)(
    '%s retains page mapping and all course choices',
    (kind, pages, choices) => {
      const actual = course(kind);
      expect(actual.document.sourcePages).toHaveLength(pages);
      expect(actual.units).toHaveLength(choices);
    },
  );

  it('keeps all 81 pinyin lessons, including two short final rows without goals', () => {
    const { document, text, units } = course('pinyin');
    expect(
      units.map((label) => Number(/^第(\d+)课时/u.exec(label)?.[1])),
    ).toEqual(Array.from({ length: 81 }, (_, index) => index + 1));
    expect(units.slice(-2)).toEqual([
      '第80课时 · 大复习',
      '第81课时 · 阶段测评四',
    ]);
    expect(units).not.toContain('第 37 周进行阶段重点内容评估；');
    expect(
      chooseCourseUnitCandidates(text, ['第 37 周进行阶段重点内容评估；']),
    ).toEqual(units);
    expect(
      selectCoursePages([document], '第81课时', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([21]);
    expect(
      extractLearningContents([document], '第81课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['阶段测评四']);
  });

  it('keeps same-numbered reading lessons separate across both book volumes', () => {
    const { document, units } = course('reading');
    for (const volume of [1, 2]) {
      const numbers = units
        .map((label) =>
          new RegExp(`^第${volume}册 第(\\d+)课时`, 'u').exec(label),
        )
        .filter((match) => match !== null)
        .map((match) => Number(match[1]));
      expect(numbers).toEqual(
        Array.from({ length: 40 }, (_, index) => index + 1),
      );
    }
    expect(
      selectCoursePages([document], '第1册 第1课时', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([3]);
    expect(
      selectCoursePages([document], '第2册 第1课时', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([11]);
    expect(units).toContain('第2册 第11课时 · 《等一等》');
    const contents = extractLearningContents(
      [document],
      '第2册 第11课时',
      'week',
    );
    expect(contents.length).toBeGreaterThan(0);
    expect(
      contents.every((item) => item.section === '第2册 第11课时 · 《等一等》'),
    ).toBe(true);
  });

  it('keeps all 18 handwriting lessons and both review sessions', () => {
    const { document, units } = course('handwriting');
    expect(
      units.map((label) => Number(/^第(\d+)课时/u.exec(label)?.[1])),
    ).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
    expect(units).toContain('第9课时 · 复习课一');
    expect(units).toContain('第18课时 · 复习课二');
    expect(
      selectCoursePages([document], '第9课时', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([2]);
    expect(
      selectCoursePages([document], '第18课时', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([4]);
    expect(
      extractLearningContents([document], '第1课时', 'week').map(
        (item) => item.text,
      ),
    ).toContain('正确的执笔');
  });

  it('keeps Unit/Lesson selection tied to its real page', () => {
    const { document, units } = course('health');
    expect(units.slice(0, 2)).toEqual(['Unit1', 'Unit1 第1课']);
    expect(units.slice(-1)).toEqual(['Unit3 第6课']);
    expect(
      selectCoursePages([document], 'Unit1 1', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([4]);
    expect(
      selectCoursePages([document], 'Unit3 6', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([10]);
    expect(selectCoursePages([document], 'Unit10 1', 'week')[0].pages).toEqual(
      [],
    );
  });
});
