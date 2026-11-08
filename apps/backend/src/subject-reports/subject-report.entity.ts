import type { PerformanceField } from '../semester-reports/performance-config';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 独立学科报告任务及冻结正文，不与学期报告主表混存。 */
@Entity('subject_reports')
export class SubjectReportEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ name: 'term_id', length: 64 }) termId!: string;
  @Column({ name: 'subject_id', length: 64 }) subjectId!: string;
  @Column({ name: 'student_id', length: 64 }) studentId!: string;
  @Column({ name: 'student_name', length: 100 }) studentName!: string;
  @Column({ name: 'class_name', length: 100 }) className!: string;
  @Column({ name: 'period_type', length: 16 }) periodType!:
    | 'week'
    | 'month'
    | 'term';
  @Column({ name: 'period_start', type: 'datetime' }) periodStart!: Date;
  @Column({ name: 'period_end', type: 'datetime' }) periodEnd!: Date;
  @Column({ name: 'score_scope', length: 16, default: 'overall' })
  scoreScope!: string;
  @Column({ type: 'json', nullable: true }) snapshot!: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'json', nullable: true }) content!: Record<
    string,
    unknown
  > | null;
  @Column({ name: 'ai_response', type: 'json', nullable: true })
  aiResponse!: Record<string, unknown> | null;
  @Column({ type: 'varchar', length: 24, default: 'queued' }) status!: string;
  @Column({ type: 'text', nullable: true }) keywords!: string | null;
  @Column({ name: 'teacher_observation', type: 'text', nullable: true })
  teacherObservation!: string | null;
  @Column({ name: 'course_scope', type: 'text', nullable: true }) courseScope!:
    | string
    | null;
  @Column({
    name: 'error_message',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  errorMessage!: string | null;
  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

/** 独立学科报告的公开分享凭据。 */
@Entity('subject_report_shares')
export class SubjectReportShareEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ name: 'report_id', length: 64 }) reportId!: string;
  @Column({ name: 'token_hash', length: 64, unique: true }) tokenHash!: string;
  @Column({ name: 'token_ciphertext', type: 'text' }) tokenCiphertext!: string;
  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

/** 独立学科报告的操作流程流水。 */
@Entity('subject_report_events')
export class SubjectReportEventEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ name: 'report_id', type: 'varchar', length: 64, nullable: true })
  reportId!: string | null;
  @Column({ name: 'document_id', type: 'varchar', length: 64, nullable: true })
  documentId!: string | null;
  @Column({ length: 40 }) action!: string;
  @Column({ type: 'json', nullable: true }) details!: Record<
    string,
    unknown
  > | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

/** 独立学科报告的模型调用和用量记录。 */
@Entity('subject_report_token_calls')
export class SubjectReportTokenCallEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'report_id', length: 64 }) reportId!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ name: 'student_id', length: 64 }) studentId!: string;
  @Column({ length: 32, default: 'kimi' }) provider!: string;
  @Column({ length: 64 }) model!: string;
  @Column({ name: 'called_at', type: 'datetime' }) calledAt!: Date;
  @Column({ name: 'responded_at', type: 'datetime', nullable: true })
  respondedAt!: Date | null;
  @Column({ name: 'prompt_tokens', type: 'int', nullable: true })
  promptTokens!: number | null;
  @Column({ name: 'completion_tokens', type: 'int', nullable: true })
  completionTokens!: number | null;
  @Column({ name: 'total_tokens', type: 'int', nullable: true })
  totalTokens!: number | null;
  @Column({ length: 24, default: 'in_progress' }) status!:
    | 'in_progress'
    | 'responded'
    | 'failed';
  @Column({ name: 'response_id', type: 'varchar', length: 128, nullable: true })
  responseId!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

/** 仅供学科报告使用的学科设置，支持按学期绑定、停用及标题配置。 */
@Entity('subject_report_subjects')
export class SubjectReportSubjectEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ name: 'term_id', type: 'varchar', length: 64, nullable: true })
  termId!: string | null;
  @Column({ length: 100 }) name!: string;
  @Column({ default: true }) enabled!: boolean;
  @Column({ name: 'performance_config', type: 'json', nullable: true })
  performanceConfig!: PerformanceField[] | null;
  /** null 使用历史默认标题，空数组表示教师删除全部标题；不回写历史正文。 */
  @Column({ name: 'course_content_titles', type: 'json', nullable: true })
  courseContentTitles!: string[] | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
