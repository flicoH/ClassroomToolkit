import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';

export const otherAiOperations = [
  'pdf_upload',
  'pdf_content',
  'pdf_delete',
  'balance',
] as const;

type Context = {
  operation: (typeof otherAiOperations)[number];
  documentId?: string;
  teacherId?: string;
  page?: number;
};

type ResponseDetails = { httpStatus?: number; usage?: unknown };

function tokenCount(usage: unknown, field: string) {
  const value =
    usage && typeof usage === 'object'
      ? (usage as Record<string, unknown>)[field]
      : null;
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 2147483647
    ? value
    : null;
}

export function responseUsage(body: unknown) {
  return body && typeof body === 'object' && 'usage' in body
    ? body.usage
    : undefined;
}

function sqlDate(date: Date) {
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

export async function trackOtherAiCall<T>(
  database: Pick<EntityManager, 'query'> | undefined,
  context: Context,
  run: (details: ResponseDetails) => Promise<T>,
): Promise<T> {
  const started = new Date();
  const details: ResponseDetails = {};
  let status = 'failed';
  try {
    const result = await run(details);
    status = 'responded';
    return result;
  } finally {
    if (database) {
      const responded = new Date();
      const id = randomUUID();
      // Record explicit provider counts only. Missing usage is not a measured zero.
      try {
        await database.query(
          `INSERT INTO other_ai_calls
            (id, operation, document_id, teacher_id, page_number, called_at,
              responded_at, status, http_status, prompt_tokens, completion_tokens, total_tokens)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            context.operation,
            context.documentId ?? null,
            context.teacherId ?? null,
            context.page ?? null,
            sqlDate(started),
            sqlDate(responded),
            status,
            details.httpStatus ?? null,
            tokenCount(details.usage, 'prompt_tokens'),
            tokenCount(details.usage, 'completion_tokens'),
            tokenCount(details.usage, 'total_tokens'),
          ],
        );
      } catch {
        console.error(
          `AI 调用流水写入失败 id=${id} operation=${context.operation}`,
        );
      }
    }
  }
}
