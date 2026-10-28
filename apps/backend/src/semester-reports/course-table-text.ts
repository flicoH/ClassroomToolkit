function cellText(value: string) {
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return (
    value
      .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/giu, '')
      .replace(/<[^>]*>/gu, ' ')
      .replace(
        /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu,
        (entity, name: string) => {
          if (!name.startsWith('#'))
            return entities[name.toLowerCase()] ?? entity;
          const number =
            name[1]?.toLowerCase() === 'x'
              ? parseInt(name.slice(2), 16)
              : Number(name.slice(1));
          return number > 0 &&
            number <= 0x10ffff &&
            !(number >= 0xd800 && number <= 0xdfff)
            ? String.fromCodePoint(number)
            : entity;
        },
      )
      // Pipes and newlines inside cells must not create extra table columns/rows.
      .replace(/\|/gu, '&#124;')
      .replace(/\s+/gu, ' ')
      .trim()
  );
}

/** Normalize cloud table markup for indexing only; stored source text and PDF page numbers stay intact. */
export function courseTableText(text: string) {
  const tables = text.replace(
    /<table\b[^>]*>([\s\S]*?)<\/table>/giu,
    (_, table: string) => {
      const pending = new Map<number, { text: string; rows: number }>();
      const lines: string[] = [];
      for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)) {
        const cells: string[] = [];
        for (const [column, value] of pending) {
          cells[column] = value.text;
          if (--value.rows === 0) pending.delete(column);
        }
        let column = 0;
        for (const cell of row[1]!.matchAll(
          /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/giu,
        )) {
          while (cells[column] !== undefined) column++;
          const span = (name: string) => {
            const match = new RegExp(
              `\\b${name}\\s*=\\s*["']?(\\d+)`,
              'iu',
            ).exec(cell[1]!);
            return Math.min(32, Math.max(1, Number(match?.[1]) || 1));
          };
          const columns = span('colspan');
          const rows = span('rowspan');
          for (let offset = 0; offset < columns; offset++) {
            const value = offset === 0 ? cellText(cell[2]!) : '';
            cells[column + offset] = value;
            if (rows > 1)
              pending.set(column + offset, { text: value, rows: rows - 1 });
          }
          column += columns;
        }
        if (cells.length)
          lines.push(
            `|${Array.from(cells, (value) => value ?? '').join('|')}|`,
          );
      }
      return `\n${lines.join('\n')}\n`;
    },
  );
  return flattenedLessonTables(tables);
}

/** Cloud extraction sometimes flattens a whole grid into interleaved columns.
 * Only recover unambiguous number/title pairs; guessing goal boundaries here
 * would mix the next lesson's goals and homework into the report. */
function flattenedLessonTables(text: string) {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];
  const headings = [
    /^(?:课时|课次|节次)$/u,
    /^(?:课程|课题|教学内容)$/u,
    /^(?:(?:教学|学习)?目标(?:及内容)?)$/u,
    /^(?:重难点(?:及技巧策略)?|教学策略)$/u,
    /^(?:家庭活动建议|家庭活动|家庭作业)$/u,
  ];
  for (let index = 0; index < lines.length; index++) {
    let cursor = index;
    const header = headings.every((heading) => {
      while (cursor < lines.length && !lines[cursor]!.trim()) cursor++;
      return heading.test(lines[cursor++]?.trim() ?? '');
    });
    if (!header) {
      result.push(lines[index]!);
      continue;
    }
    const start = cursor;
    while (
      cursor < lines.length &&
      !/^\s*(?:\||【PDF第\d+页】|#{1,3}\s|[一二三四五六七八九十]+[、．.])/u.test(
        lines[cursor]!,
      )
    )
      cursor++;
    const rows: Array<{ number: number; title: string }> = [];
    for (let row = start; row < cursor - 1; row++) {
      if (!/^0*\d{1,3}$/u.test(lines[row]!.trim())) continue;
      const number = Number(lines[row]!.trim());
      let next = row + 1;
      while (next < cursor && !lines[next]!.trim()) next++;
      const title = lines[next]?.trim() ?? '';
      if (
        number > 0 &&
        number <= 300 &&
        title.length > 1 &&
        title.length <= 80 &&
        !/^(?:\d|目标|掌握|学会|技巧|重难点|家庭)/u.test(title)
      )
        rows.push({ number, title });
    }
    // Multiple increasing rows plus all five headings distinguish a syllabus
    // from isolated page numbers and numbered prose.
    if (
      rows.length < 2 ||
      rows.some((row, i) => i > 0 && row.number !== rows[i - 1]!.number + 1)
    ) {
      result.push(lines[index]!);
      continue;
    }
    result.push('|课时|课程|目标及内容|重难点及技巧策略|家庭活动建议|');
    for (const row of rows)
      result.push(`|${row.number}|${row.title.replace(/\|/gu, '&#124;')}|||`);
    index = cursor - 1;
  }
  return result.join('\n');
}
