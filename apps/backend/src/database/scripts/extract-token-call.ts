export interface ExtractedTokenCall {
  provider: string;
  model: string;
  calledAt: Date;
  respondedAt: Date;
  status: 'responded' | 'failed';
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  responseId: string | null;
}

/** 从报告持久化的 aiResponse 字段安全提取模型调用凭证与 Token 用量。 */
export function extractCallFromAiResponse(
  aiResponse: unknown,
  reportCreatedAt: Date,
  reportUpdatedAt?: Date | null,
): ExtractedTokenCall | null {
  if (!aiResponse) return null;
  let data: Record<string, unknown> | null = null;
  if (typeof aiResponse === 'string') {
    try {
      data = JSON.parse(aiResponse) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof aiResponse === 'object') {
    data = aiResponse as Record<string, unknown>;
  }
  if (!data) return null;

  const usage = data.usage as Record<string, unknown> | undefined;
  const hasUsage = usage && typeof usage === 'object';

  const promptTokens =
    hasUsage &&
    typeof usage.prompt_tokens === 'number' &&
    Number.isFinite(usage.prompt_tokens)
      ? Math.max(0, Math.floor(usage.prompt_tokens))
      : null;
  const completionTokens =
    hasUsage &&
    typeof usage.completion_tokens === 'number' &&
    Number.isFinite(usage.completion_tokens)
      ? Math.max(0, Math.floor(usage.completion_tokens))
      : null;
  const totalTokens =
    hasUsage &&
    typeof usage.total_tokens === 'number' &&
    Number.isFinite(usage.total_tokens)
      ? Math.max(0, Math.floor(usage.total_tokens))
      : null;

  const responseId =
    typeof data.id === 'string' && data.id.trim()
      ? data.id.trim().slice(0, 128)
      : null;
  const rawModel =
    typeof data.model === 'string' && data.model.trim()
      ? data.model.trim().slice(0, 64)
      : 'moonshot-v1-8k';
  const provider = rawModel.toLowerCase().includes('kimi')
    ? 'kimi'
    : 'moonshot';

  let calledAt =
    reportCreatedAt instanceof Date
      ? reportCreatedAt
      : new Date(reportCreatedAt);
  if (
    typeof data.created === 'number' &&
    Number.isFinite(data.created) &&
    data.created > 0
  ) {
    calledAt = new Date(data.created * 1000);
  }

  const respondedAt =
    reportUpdatedAt &&
    (reportUpdatedAt instanceof Date
      ? reportUpdatedAt
      : new Date(reportUpdatedAt)) >= calledAt
      ? reportUpdatedAt instanceof Date
        ? reportUpdatedAt
        : new Date(reportUpdatedAt)
      : new Date(calledAt.getTime() + 2000);

  const isError = Boolean(data.error);
  const status: 'responded' | 'failed' = isError ? 'failed' : 'responded';

  // 必须至少具有有效模型响应、usage 或错误标识，避免非 AI 结构误入
  if (!hasUsage && !data.choices && !isError) {
    return null;
  }

  return {
    provider,
    model: rawModel,
    calledAt,
    respondedAt,
    status,
    promptTokens,
    completionTokens,
    totalTokens,
    responseId,
  };
}
