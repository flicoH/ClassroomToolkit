import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** TypeORM imports every matching module, so only timestamped migration files
 * may enter this list. Tests, helpers and declarations must never be executed. */
export function migrationFiles(
  directory: string,
  extensions: readonly ('js' | 'ts')[] = ['js', 'ts'],
): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => {
      const match = /^\d{14}-[A-Za-z0-9_-]+\.(js|ts)$/.exec(entry.name);
      return (
        entry.isFile() &&
        match !== null &&
        extensions.includes(match[1] as 'js' | 'ts')
      );
    })
    .map((entry) => join(directory, entry.name))
    .sort();
}
