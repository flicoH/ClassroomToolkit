import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('teacher_auth_teachers')
@Index('idx_account_parent', ['parentAccountId', 'status'])
export class TeacherEntity {
  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ length: 64, unique: true })
  username!: string;

  @Column({ length: 64 })
  name!: string;

  @Column({ length: 128 })
  email!: string;

  @Column({ length: 512, default: '' })
  avatar!: string;

  @Column({ name: 'password_hash', length: 256 })
  passwordHash!: string;

  @Column({ name: 'password_salt', length: 64 })
  passwordSalt!: string;

  @Column({
    name: 'parent_account_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  parentAccountId!: string | null;

  @Column({ length: 16, default: 'active' })
  status!: 'active' | 'locked' | 'deleted';

  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'session_version', type: 'int', default: 0 })
  sessionVersion!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
