import type { PerformanceField } from './performance-config';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 跨工作台共享的学期元数据，停用不解除历史关联。 */
@Entity('semester_report_terms')
export class ReportTermEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ length: 100 }) name!: string;
  @Column({ name: 'start_date', type: 'date' }) startDate!: string;
  @Column({ name: 'end_date', type: 'date' }) endDate!: string;
  /** 停用后仍保留历史报告和资料中的学期关联标识。 */
  @Column({ default: true }) enabled!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

/** 学期报告专用学科设置，与学科报告配置独立；支持按学期绑定。 */
@Entity('semester_report_subjects')
export class ReportSubjectEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ name: 'term_id', type: 'varchar', length: 64, nullable: true })
  termId!: string | null;
  @Column({ length: 100 }) name!: string;
  @Column({ default: true }) enabled!: boolean;
  @Column({ name: 'performance_config', type: 'json', nullable: true })
  performanceConfig!: PerformanceField[] | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

/** 课程资料元数据和解析状态，按教师及学期学科限定归属。 */
@Entity('semester_report_documents')
export class ReportDocumentEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ name: 'term_id', length: 64 }) termId!: string;
  @Column({ name: 'subject_id', length: 64 }) subjectId!: string;
  @Column({ name: 'class_id', length: 64, default: '*' }) classId!: string;
  @Column({ name: 'file_name', length: 255 }) fileName!: string;
  @Column({ name: 'file_hash', length: 64 }) fileHash!: string;
  @Column({
    name: 'storage_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  storagePath!: string | null;
  @Column({ name: 'content_text', type: 'longtext', nullable: true })
  contentText!: string | null;
  @Column({ name: 'source_pages', type: 'json', nullable: true })
  sourcePages!: Array<{ page: number; text: string }> | null;
  @Column({ type: 'varchar', length: 24, default: 'uploaded' }) status!: string;
  @Column({
    name: 'error_message',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  errorMessage!: string | null;
  @Column({ name: 'confirmed_units', type: 'json', nullable: true })
  confirmedUnits!: string[] | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

/** 学期报告任务及正文快照，展示内容不依赖当前设置重算。 */
@Entity('semester_reports')
export class SemesterReportEntity {
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

/** 学期报告公开分享凭据，撤回通过失效标记控制。 */
@Entity('semester_report_shares')
export class ReportShareEntity {
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

/** 报告操作流水，用于流程展示和版本追溯。 */
@Entity('semester_report_events')
export class ReportEventEntity {
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

/** 学期与阶段报告的大模型调用流水，按教师与生成任务审计请求用量及状态。 */
@Entity('semester_report_token_calls')
export class SemesterReportTokenCallEntity {
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
