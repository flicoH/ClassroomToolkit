import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('admin_report_ai_teacher_permissions')
export class ReportAiTeacherPermissionEntity {
  @PrimaryColumn({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
