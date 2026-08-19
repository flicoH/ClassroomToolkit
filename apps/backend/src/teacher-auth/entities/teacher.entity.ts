import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('teacher_auth_teachers')
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
