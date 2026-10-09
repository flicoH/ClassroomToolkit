import type { ReportDocumentEntity } from './semester-report.entity';
import { courseTableText } from './course-table-text';

type Page = { page: number; text: string };
// unit 0 denotes a course whose PDF numbers lessons without naming units.
type Section = {
  unit: number;
  lesson?: number;
  title?: string;
  volume?: number;
};
type StandaloneLesson = { lesson: number; volume?: number };
type LessonTableLayout = { lessonIndex: number; titleIndex: number };
type CourseLine = { page: number; section: Section; text: string };
export type LearningContent = {
  id: string;
  section: string;
  text: string;
  sourceRefs: string[];
};
type CourseDocument = Pick<
  ReportDocumentEntity,
  'id' | 'fileName' | 'sourcePages' | 'confirmedUnits'
>;

function chineseNumber(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = '零一二三四五六七八九';
  let result = 0;
  let digit = 0;
  for (const character of value) {
    if (character === '十' || character === '百') {
      result += (digit || 1) * (character === '十' ? 10 : 100);
      digit = 0;
    } else {
      digit =
        character === '两'
          ? 2
          : character === '〇'
            ? 0
            : digits.indexOf(character);
    }
  }
  return result + digit;
}

function canonicalize(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(
      /第\s*([\d零〇一二三四五六七八九十百两]+)\s*单元/gu,
      (_, number: string) => `unit${chineseNumber(number)}`,
    )
    .replace(
      /第\s*([\d零〇一二三四五六七八九十百两]+)\s*课时/gu,
      (_, number: string) => `lesson${chineseNumber(number)}`,
    )
    .replace(
      /第\s*([\d零〇一二三四五六七八九十百两]+)\s*[课节]/gu,
      (_, number: string) => `lesson${chineseNumber(number)}`,
    );
}

function scopeSelectors(scope: string) {
  const sections: Section[] = [];
  const afterUnits = canonicalize(scope).replace(
    /\bunit\s*(\d+)(?!\d)(?:\s*(?:[·:：-]\s*)?lesson\s*(\d+)(?!\d)|\s+(\d+)(?!\d))?(?:\s*[-–—~至到]\s*(?:lesson\s*)?(\d+)(?!\d))?/gu,
    (
      _,
      unit: string,
      namedLesson?: string,
      bareLesson?: string,
      lastLesson?: string,
    ) => {
      const lesson = namedLesson ?? bareLesson;
      if (lesson && lastLesson) {
        const first = Number(lesson);
        const last = Number(lastLesson);
        if (last >= first && last - first < 100) {
          for (let number = first; number <= last; number++)
            sections.push({ unit: Number(unit), lesson: number });
        }
      } else {
        sections.push({
          unit: Number(unit),
          ...(lesson ? { lesson: Number(lesson) } : {}),
        });
      }
      return '';
    },
  );
  const standaloneLessons: StandaloneLesson[] = [];
  const remaining = afterUnits.replace(
    /(?:第\s*(\d+)\s*册\s*)?\blesson\s*(\d+)(?!\d)(?:\s*[-–—~至到]\s*lesson\s*(\d+)(?!\d))?/gu,
    (_, volume: string | undefined, first: string, last?: string) => {
      const start = Number(first);
      const end = last ? Number(last) : start;
      if (start > 0 && end >= start && end - start < 100)
        for (let number = start; number <= end; number++)
          standaloneLessons.push({
            lesson: number,
            ...(volume ? { volume: Number(volume) } : {}),
          });
      return '';
    },
  );
  const pageNumbers: number[] = [];
  const afterPages = remaining.replace(
    /第?\s*(\d{1,3})(?:\s*[-–—~至到]\s*(\d{1,3}))?\s*页/gu,
    (_, first: string, last?: string) => {
      const start = Number(first);
      const end = last ? Number(last) : start;
      if (start > 0 && end >= start && end <= 300)
        for (let number = start; number <= end; number++)
          pageNumbers.push(number);
      return '';
    },
  );
  const terms = afterPages
    .split(/[\s,，、;；/]+/)
    .map(normalizeText)
    .filter((value) => value.length >= 2);
  return { sections, standaloneLessons, pageNumbers, terms };
}

function normalizeText(value: string) {
  return canonicalize(value).replace(/[^\p{L}\p{N}]/gu, '');
}

function matchesStandaloneLesson(wanted: StandaloneLesson, section: Section) {
  return (
    section.unit === 0 &&
    section.lesson === wanted.lesson &&
    (wanted.volume === undefined || wanted.volume === section.volume)
  );
}

/** Recognize nearby course-table headers without relying on one school's exact wording. */
function lessonTableLayout(cells: string[]): LessonTableLayout | undefined {
  const headings = cells.map((cell) =>
    cell.normalize('NFKC').replace(/\s+/gu, ''),
  );
  const lessonIndex = headings.findIndex(
    (heading, index) =>
      index < 3 &&
      (/^(?:周\/)?(?:课时|课次|节次)(?:编号)?$/u.test(heading) ||
        /(?:^|-)课时$/u.test(heading) ||
        (heading === '序号' &&
          headings.some((value) => /(?:教学|学习)?目标/u.test(value)))),
  );
  if (
    lessonIndex < 0 ||
    (lessonIndex > 0 && /^(?:单元|unit)/iu.test(headings[0] ?? ''))
  )
    return undefined;
  const titleIndex = headings.findIndex(
    (heading, index) =>
      index > lessonIndex &&
      index <= lessonIndex + 2 &&
      (/^(?:(?:单元|课程|课题|教学|学习)?(?:名称|主题|内容)|课程|课题|单元|主题|内容)$/u.test(
        heading,
      ) ||
        /(?:^|-)课程$/u.test(heading)),
  );
  return titleIndex < 0 ? undefined : { lessonIndex, titleIndex };
}

/** Read section labels from headings and nearby numbered course-table columns. */
function readSections(pages: Page[]) {
  const byPage = new Map<number, Section[]>();
  const units = new Set<string>();
  const structuredUnits = new Set<string>();
  const contentLines: CourseLine[] = [];
  let active: Section | undefined;
  let headingSection = false;
  let standaloneLayout: LessonTableLayout | undefined;
  let activeVolume: number | undefined;
  for (const page of pages) {
    const sections: Section[] = [];
    for (const rawLine of courseTableText(page.text).split(/\r?\n/)) {
      const line = rawLine.trim().replace(/｜/gu, '|');
      const table = line.startsWith('|');
      let cells = table
        ? line
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((cell) => cell.trim().replace(/&#124;/gu, '|'))
        : [];
      if (table && cells.every((cell) => /^[-:\s]*$/.test(cell))) continue;
      const label = (table ? (cells[0] ?? '') : line)
        .replace(/^[#*\s]+/, '')
        .trim();
      const markdownHeading = !table && /^#{1,3}\s+(.{2,100})$/u.exec(line);
      if (!table && /^(?:[一二三四五六七八九十]+|\d+)[、.．]\s*\S/u.test(label))
        standaloneLayout = undefined;
      const volume = table && /(?:^|\D)([1-9]\d?)\s*册/u.exec(cells[0] ?? '');
      if (volume) activeVolume = Number(volume[1]);
      if (table) {
        const nextLayout = lessonTableLayout(cells);
        if (nextLayout) standaloneLayout = nextLayout;
        else if (
          standaloneLayout &&
          cells[0] &&
          cells[1] &&
          cells[0].length <= 35 &&
          cells[1].length <= 35 &&
          !/\d/u.test(cells[0]) &&
          !/\d/u.test(cells[1])
        ) {
          // A new nonnumeric table header ends the prior course table; this
          // prevents later numbered file lists from becoming fake lessons.
          standaloneLayout = undefined;
        }
      }
      const unit = /^unit\s*(\d+)(?=$|[\s:：.、-])/u.exec(canonicalize(label));
      // Cloud OCR can combine the first two columns; inserting the explicit
      // lesson restores goal alignment without guessing displaced table cells.
      const combinedUnit =
        table && /^unit\s*\d+\s+(\d+)$/u.exec(canonicalize(label));
      if (combinedUnit)
        cells = [cells[0]!, combinedUnit[1]!, ...cells.slice(1)];
      const lessonCell = (
        cells[standaloneLayout?.lessonIndex ?? 0] ?? ''
      ).trim();
      const titleCell = (cells[standaloneLayout?.titleIndex ?? 1] ?? '').trim();
      const numberedLesson = table && /^0*(\d{1,3})$/u.exec(lessonCell);
      // Some Docling pages merge the lesson number and title into one cell.
      const mergedLesson =
        table && /^0*(\d{1,3})\s+(.{2,80})$/u.exec(lessonCell);
      const lessonNumber = numberedLesson
        ? Number(numberedLesson[1])
        : mergedLesson
          ? Number(mergedLesson[1])
          : 0;
      const shiftedTitle =
        numberedLesson &&
        /^\d{1,2}(?:[.、．]\s*|\s+)[\p{L}]/u.test(titleCell) &&
        cells
          .slice((standaloneLayout?.titleIndex ?? 1) + 1)
          .map((cell) => /^(?:复习课|《[^》]{1,60}》)/u.exec(cell.trim())?.[0])
          .find(Boolean);
      const courseTitle = (
        mergedLesson?.[2] ??
        (shiftedTitle || titleCell)
      ).trim();
      const standaloneGoals =
        mergedLesson || shiftedTitle
          ? titleCell
          : cells[(standaloneLayout?.titleIndex ?? 1) + 1];
      const explicitLesson =
        /^第\s*0*(\d{1,3})\s*(?:课时|课|节)(?=$|[\s《:：、.-])/u.exec(
          courseTitle,
        );
      const standaloneLesson =
        lessonNumber > 0 &&
        lessonNumber <= 300 &&
        courseTitle.length > 0 &&
        ((!!standaloneLayout && courseTitle.length <= 80) ||
          /^《[^》]+》/u.test(courseTitle) ||
          Number(explicitLesson?.[1]) === lessonNumber);
      if (unit && label.length < 100) {
        active = { unit: Number(unit[1]) };
        headingSection = !table;
        if (!table) {
          const lesson = /lesson\s*(\d+)/u.exec(canonicalize(label));
          if (lesson) active.lesson = Number(lesson[1]);
        }
        if (table) {
          const lesson = /^(\d+)(?=$|\s)/u.exec(cells[1] ?? '');
          if (lesson) active.lesson = Number(lesson[1]);
        }
        sections.push({ ...active });
        units.add(`Unit${active.unit}`);
        structuredUnits.add(`Unit${active.unit}`);
        if (active.lesson !== undefined)
          structuredUnits.add(`Unit${active.unit} 第${active.lesson}课`);
      } else if (standaloneLesson) {
        const title = (
          courseTitle.match(/《[^》]{1,60}》/u)?.[0] ?? courseTitle
        ).slice(0, 60);
        active = { unit: 0, lesson: lessonNumber, title, volume: activeVolume };
        headingSection = false;
        sections.push({ ...active });
        structuredUnits.add(
          `${activeVolume ? `第${activeVolume}册 ` : ''}第${lessonNumber}课时 · ${title}`,
        );
      } else if (table) {
        if (active?.unit === -1) {
          sections.push({ ...active });
        } else if (cells[0]) {
          // A different named row (e.g. Drama) ends the previous unit.
          active = undefined;
          headingSection = false;
        } else if (active && cells.some(Boolean)) {
          const lesson = /^(\d+)(?=$|\s)/u.exec(cells[1] ?? '');
          if (lesson) active.lesson = Number(lesson[1]);
          sections.push({ ...active });
          if (active.unit !== 0 && active.lesson !== undefined)
            structuredUnits.add(`Unit${active.unit} 第${active.lesson}课`);
        }
      } else {
        const lesson = /^lesson\s*(\d+)(?=$|[\s:：.、-])/u.exec(
          canonicalize(label),
        );
        if (lesson && active && headingSection) {
          active.lesson = Number(lesson[1]);
          sections.push({ ...active });
          units.add(`Unit${active.unit} 第${active.lesson}课`);
          structuredUnits.add(`Unit${active.unit} 第${active.lesson}课`);
        } else if (markdownHeading) {
          active = { unit: -1, title: markdownHeading[1]?.trim() ?? '' };
          headingSection = true;
          sections.push({ ...active });
          units.add(active.title!);
        } else if (
          label.length > 1 &&
          label.length < 100 &&
          /^(?:第\s*[\d零〇一二三四五六七八九十百两]+\s*(?:单元|课时|课|节|章|周)(?=$|[\s:：.、-])|Lesson\s*\d+(?=$|[\s:：.、-]))/iu.test(
            label,
          )
        ) {
          units.add(label);
        } else if (label && active && headingSection) {
          sections.push({ ...active });
        }
      }
      if (active && sections.length) {
        if (table) {
          if (active.unit === -1) {
            contentLines.push({
              page: page.page,
              section: { ...active },
              text: line,
            });
            continue;
          }
          // Docling may merge the lesson number and teaching content into one cell.
          const merged = /^\d+\s+(.+)/u.exec(cells[1] ?? '');
          const teaching =
            active.unit === 0 ? courseTitle : (merged?.[1] ?? cells[2] ?? '');
          const goals =
            active.unit === 0
              ? standaloneGoals
              : merged
                ? cells[2]
                : cells.length >= 6
                  ? cells[3]
                  : '';
          const text = (goals || teaching || '').trim();
          if (text)
            contentLines.push({
              page: page.page,
              section: { ...active },
              text,
            });
        } else if (
          !unit &&
          !/^lesson\s*\d+/u.test(canonicalize(label)) &&
          line
        ) {
          contentLines.push({
            page: page.page,
            section: { ...active },
            text: line,
          });
        }
      }
    }
    byPage.set(page.page, sections);
  }
  // General goals, cover titles and page headers are not extra lessons when
  // an actual numbered syllabus is available; heading-only PDFs still use them.
  return {
    byPage,
    units: [...(structuredUnits.size ? structuredUnits : units)].slice(0, 300),
    contentLines,
  };
}

export function detectCourseUnits(text: string) {
  const detected = readSections([{ page: 1, text }]).units;
  if (detected.length) return detected;
  // Page markers are stored alongside Docling text even for scanned or
  // heading-free documents. They remain selectable after teacher confirmation.
  return [
    ...new Set(
      [...text.matchAll(/【PDF第(\d{1,3})页】/gu)].map((match) =>
        Number(match[1]),
      ),
    ),
  ]
    .filter((page) => page > 0 && page <= 300)
    .map((page) => `第${page}页`);
}

/** Prefer lesson/table recognition to sparse parser headings; keep parser hints for unstructured PDFs. */
export function chooseCourseUnitCandidates(
  text: string,
  parserUnits: string[],
) {
  const detected = detectCourseUnits(text);
  if (detected.some((unit) => !/^第\d+页$/u.test(unit))) return detected;
  return parserUnits.length ? parserUnits : detected;
}

export function selectCoursePages(
  documents: CourseDocument[],
  scope: string,
  period: 'week' | 'month' | 'term',
) {
  const selectors = scopeSelectors(scope);
  return documents.map((document) => {
    const pages = [...(document.sourcePages ?? [])].sort(
      (a, b) => a.page - b.page,
    );
    const indexed = readSections(pages);
    const headingTerms = selectors.terms.filter((term) =>
      pages.some((page) =>
        indexed.byPage
          .get(page.page)
          ?.some(
            (section) =>
              section.unit === -1 &&
              normalizeText(section.title ?? '').includes(term),
          ),
      ),
    );
    const selected =
      period === 'term'
        ? pages
        : pages.filter((page) => {
            if (selectors.pageNumbers.includes(page.page)) return true;
            if (
              selectors.sections.length ||
              selectors.standaloneLessons.length
            ) {
              return indexed.byPage
                .get(page.page)
                ?.some(
                  (section) =>
                    selectors.sections.some(
                      (wanted) =>
                        section.unit === wanted.unit &&
                        (wanted.lesson === undefined ||
                          section.lesson === wanted.lesson),
                    ) ||
                    selectors.standaloneLessons.some((wanted) =>
                      matchesStandaloneLesson(wanted, section),
                    ),
                );
            }
            if (headingTerms.length)
              return indexed.byPage
                .get(page.page)
                ?.some(
                  (section) =>
                    section.unit === -1 &&
                    headingTerms.some((term) =>
                      normalizeText(section.title ?? '').includes(term),
                    ),
                );
            const text = normalizeText(page.text);
            return selectors.terms.some((term) => text.includes(term));
          });
    const sourceUnits = document.confirmedUnits?.length
      ? document.confirmedUnits
      : indexed.units.length
        ? indexed.units
        : pages.map((page) => `第${page.page}页`);
    const selectedSectionLabels = new Set(readSections(selected).units);
    const units = sourceUnits.filter((unit) => {
      if (period === 'term') return true;
      if (
        scopeSelectors(unit).pageNumbers.some((page) =>
          selectors.pageNumbers.includes(page),
        )
      )
        return true;
      if (selectors.sections.length || selectors.standaloneLessons.length) {
        const source = scopeSelectors(unit);
        if (
          source.standaloneLessons.some((section) =>
            selectors.standaloneLessons.some((wanted) =>
              matchesStandaloneLesson(wanted, { unit: 0, ...section }),
            ),
          )
        )
          return true;
        return source.sections.some((section) =>
          selectors.sections.some(
            (wanted) =>
              section.unit === wanted.unit &&
              (wanted.lesson === undefined ||
                section.lesson === undefined ||
                section.lesson === wanted.lesson),
          ),
        );
      }
      return (
        selectedSectionLabels.has(unit) ||
        selected.some((page) =>
          normalizeText(page.text).includes(normalizeText(unit)),
        )
      );
    });
    return {
      id: document.id,
      fileName: document.fileName,
      pages: selected,
      units,
    };
  });
}

/** Extract selected rows, rather than every lesson sharing a matching PDF page. */
export function extractLearningContents(
  documents: CourseDocument[],
  scope: string,
  period: 'week' | 'month' | 'term',
): LearningContent[] {
  const selectors = scopeSelectors(scope);
  const result: LearningContent[] = [];
  for (const document of documents) {
    const pages = [...(document.sourcePages ?? [])].sort(
      (a, b) => a.page - b.page,
    );
    const indexed = readSections(pages);
    const selectedPages = new Set(
      selectCoursePages([document], scope, period)[0]!.pages.map(
        (page) => page.page,
      ),
    );
    const groups = new Map<
      string,
      {
        section: string;
        text: string[];
        sourceRefs: Set<string>;
        standalone: boolean;
      }
    >();
    for (const line of indexed.contentLines) {
      if (!selectedPages.has(line.page)) continue;
      if (
        period !== 'term' &&
        (selectors.sections.length || selectors.standaloneLessons.length) &&
        !selectors.sections.some(
          (wanted) =>
            wanted.unit === line.section.unit &&
            (wanted.lesson === undefined ||
              wanted.lesson === line.section.lesson),
        ) &&
        !selectors.standaloneLessons.some((wanted) =>
          matchesStandaloneLesson(wanted, line.section),
        )
      )
        continue;
      const section =
        line.section.unit === -1
          ? (line.section.title ?? `${document.fileName} · 第${line.page}页`)
          : line.section.unit === 0
            ? `${line.section.volume ? `第${line.section.volume}册 ` : ''}第${line.section.lesson}课时${line.section.title ? ` · ${line.section.title}` : ''}`
            : `Unit${line.section.unit}${line.section.lesson === undefined ? '' : ` 第${line.section.lesson}课`}`;
      const group = groups.get(section) ?? {
        section,
        text: [],
        sourceRefs: new Set<string>(),
        standalone: line.section.unit === 0,
      };
      group.text.push(line.text);
      group.sourceRefs.add(`course:${document.id}:p${line.page}`);
      groups.set(section, group);
    }
    // Heading-free PDFs still expose the exact extracted text for teacher review.
    if (
      (!groups.size &&
        !selectors.sections.length &&
        !selectors.standaloneLessons.length) ||
      (selectors.pageNumbers.length > 0 &&
        !selectors.sections.length &&
        !selectors.standaloneLessons.length &&
        !selectors.terms.length)
    ) {
      if (selectors.pageNumbers.length) groups.clear();
      for (const page of pages.filter((page) => selectedPages.has(page.page))) {
        groups.set(`page-${page.page}`, {
          section: `${document.fileName.slice(0, 60)} · 第${page.page}页`,
          text: [page.text],
          sourceRefs: new Set([`course:${document.id}:p${page.page}`]),
          standalone: false,
        });
      }
    }
    for (const [key, group] of groups) {
      const text = group.text
        .join('\n')
        .replace(/<br\s*\/?\s*>/giu, '\n')
        .replace(/\*\*/g, '')
        .trim();
      const entries = text
        .split(
          group.standalone
            ? /(?:\n|(?:^|\s)\d{1,2}(?:[.、．]\s*|\s+)(?=[A-Za-z\u4e00-\u9fff]))/u
            : /(?:^|\s)\d{1,2}[.、．]\s*(?=[A-Za-z\u4e00-\u9fff])/u,
        )
        .map((value) => value.trim())
        .filter(Boolean);
      for (const [index, entry] of entries.entries()) {
        // Long prose remains visible in bounded chunks, without discarding its tail.
        for (let offset = 0; offset < entry.length; offset += 1200) {
          result.push({
            id: `${document.id}:${key}:${index}:${offset}`,
            section: group.section,
            text: entry.slice(offset, offset + 1200),
            sourceRefs: [...group.sourceRefs],
          });
        }
      }
    }
  }
  return result;
}
