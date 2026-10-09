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
  return text.replace(
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
}
