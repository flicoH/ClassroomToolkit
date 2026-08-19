/**
 * 生成可读性较强的业务 id，方便前端调试时直接判断资源类型。
 */
export function createEntityId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
