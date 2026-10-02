import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('semester_report_terms')
export class ReportTermEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ length: 100 }) name!: string;
  @Column({ name: 'start_date', type: 'date' }) startDate!: string;
  @Column({ name: 'end_date', type: 'date' }) endDate!: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('semester_report_subjects')
export class ReportSubjectEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ name: 'teacher_id', length: 64 }) teacherId!: string;
  @Column({ length: 100 }) name!: string;
  @Column({ default: true }) enabled!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

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
