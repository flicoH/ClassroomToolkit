import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('teacher_auth_sessions')
export class TeacherSessionEntity {
  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ name: 'teacher_id', length: 64 })
  teacherId!: string;

  @Column({ name: 'token_hash', length: 128, unique: true })
  tokenHash!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt!: Date;
}
