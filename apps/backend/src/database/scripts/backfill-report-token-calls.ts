import { DataSource } from 'typeorm';
import dataSource from '../data-source';
import {
  SemesterReportEntity,
  SemesterReportTokenCallEntity,
} from '../../semester-reports/semester-report.entity';

import {
  ExtractedTokenCall,
  extractCallFromAiResponse,
} from './extract-token-call';

export { extractCallFromAiResponse };
export type { ExtractedTokenCall };

export interface BackfillStats {
  totalReportsWithAiResponse: number;
  alreadyTrackedCount: number;
  backfilledCount: number;
  failedParseCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}

/** 幂等执行历史报告 Token 数据回填，支持 --dry-run 预览模式。 */
export async function runBackfillTokenCalls(options: {
  dataSource: DataSource;
  dryRun?: boolean;
  logger?: Console;
}): Promise<BackfillStats> {
  const { dataSource: ds, dryRun = false, logger = console } = options;
  const reportRepo = ds.getRepository(SemesterReportEntity);
  const tokenCallsRepo = ds.getRepository(SemesterReportTokenCallEntity);

  logger.log(
    `[backfill-token-calls] 开始${dryRun ? '【预览模式(DRY-RUN)】' : '【执行回填】'}：读取已落库 ai_response 并补充 token 调用记录...`,
  );

  // 1. 查找全部存在 ai_response 且未软删除的报告
  const reports = await reportRepo
    .createQueryBuilder('r')
    .where('r.status != :deleted', { deleted: 'deleted' })
    .andWhere('r.aiResponse IS NOT NULL')
    .orderBy('r.createdAt', 'ASC')
    .getMany();

  const stats: BackfillStats = {
    totalReportsWithAiResponse: reports.length,
    alreadyTrackedCount: 0,
    backfilledCount: 0,
    failedParseCount: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
  };

  if (reports.length === 0) {
    logger.log('[backfill-token-calls] 未发现带有 ai_response 的历史报告。');
    return stats;
  }

  // 2. 查出已存在调用流水的 reportId 集合，保证幂等性
  const existingCalls = await tokenCallsRepo
    .createQueryBuilder('c')
    .select('DISTINCT c.reportId', 'reportId')
    .getRawMany<{ reportId: string }>();
  const existingReportIds = new Set(existingCalls.map((c) => c.reportId));

  const toInsert: SemesterReportTokenCallEntity[] = [];

  for (const report of reports) {
    if (existingReportIds.has(report.id)) {
      stats.alreadyTrackedCount++;
      continue;
    }

    const extracted = extractCallFromAiResponse(
      report.aiResponse,
      report.createdAt,
      report.updatedAt,
    );
    if (!extracted) {
      stats.failedParseCount++;
      continue;
    }

    const callId = `hist-${report.id}`.slice(0, 64);
    const entity = tokenCallsRepo.create({
      id: callId,
      reportId: report.id,
      teacherId: report.teacherId,
      studentId: report.studentId,
      provider: extracted.provider,
      model: extracted.model,
      calledAt: extracted.calledAt,
      respondedAt: extracted.respondedAt,
      promptTokens: extracted.promptTokens,
      completionTokens: extracted.completionTokens,
      totalTokens: extracted.totalTokens,
      status: extracted.status,
      responseId: extracted.responseId,
      createdAt: extracted.calledAt,
      updatedAt: extracted.respondedAt,
    });

    toInsert.push(entity);
    stats.backfilledCount++;
    stats.totalPromptTokens += extracted.promptTokens || 0;
    stats.totalCompletionTokens += extracted.completionTokens || 0;
    stats.totalTokens += extracted.totalTokens || 0;
  }

  logger.log(
    `[backfill-token-calls] 统计结果：总历史报告数=${stats.totalReportsWithAiResponse}，已追踪数(跳过)=${stats.alreadyTrackedCount}，待回填数=${stats.backfilledCount}，无法提取数=${stats.failedParseCount}。`,
  );
  logger.log(
    `[backfill-token-calls] 预计补充 Token：输入=${stats.totalPromptTokens}，输出=${stats.totalCompletionTokens}，总计=${stats.totalTokens}。`,
  );

  if (!dryRun && toInsert.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const chunk = toInsert.slice(i, i + batchSize);
      await tokenCallsRepo.save(chunk);
    }
    logger.log(
      `[backfill-token-calls] 成功写入 ${toInsert.length} 条历史模型调用记录！`,
    );
  } else if (dryRun) {
    logger.log(
      `[backfill-token-calls] 预览模式结束，未对数据库进行写入。若要执行写入，请去除 --dry-run 参数运行。`,
    );
  }

  return stats;
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  dataSource
    .initialize()
    .then(async () => {
      try {
        await runBackfillTokenCalls({ dataSource, dryRun: isDryRun });
      } finally {
        await dataSource.destroy();
      }
    })
    .catch((err: unknown) => {
      console.error('[backfill-token-calls] 脚本执行失败:', err);
      process.exit(1);
    });
}
