import { BadRequestException } from '@nestjs/common';

export type PerformanceField = { label: string; options: string[] };
export function defaultPerformanceConfig(): PerformanceField[] {
  return [
    { label: '课程任务', options: ['独立完成', '基本完成', '需要帮助'] },
    { label: '听指令反应', options: ['能听懂并反应', '基本听懂', '需要引导'] },
    { label: '课堂参与', options: ['主动参与', '引导参与', '需要鼓励'] },
    { label: '专注情况', options: ['专注稳定', '基本专注', '需要提醒'] },
  ];
}

/** Bound teacher-owned configuration to the existing per-subject report limits. */
export function parsePerformanceConfig(value: unknown): PerformanceField[] {
  const fail = (): never => {
    throw new BadRequestException(
      '课堂表现需要 4—12 项，项目名称最多 30 字，每项需 1—20 个不重复的选项（每个最多 100 字）',
    );
  };
  if (!Array.isArray(value) || value.length < 4 || value.length > 12)
    return fail();
  const labels = new Set<string>();
  const fields = value.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail();
    const { label, options } = raw as Record<string, unknown>;
    if (
      typeof label !== 'string' ||
      !label.trim() ||
      label.trim().length > 30 ||
      labels.has(label.trim())
    )
      return fail();
    labels.add(label.trim());
    if (!Array.isArray(options) || !options.length || options.length > 20)
      return fail();
    const cleaned = options.map((option: unknown) => {
      if (
        typeof option !== 'string' ||
        !option.trim() ||
        option.trim().length > 100
      )
        return fail();
      return option.trim();
    });
    if (new Set(cleaned).size !== cleaned.length) return fail();
    return { label: label.trim(), options: cleaned };
  });
  if (defaultPerformanceConfig().some((field) => !labels.has(field.label)))
    return fail();
  return fields;
}
