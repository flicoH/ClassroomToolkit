import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
/** 管理员与教师分表存储，避免教师账号获得平台管理权限。 */
@Entity('admin_accounts')
export class AdminAccountEntity {
  @PrimaryColumn({ length: 64 }) id!: string;
  @Column({ length: 64, unique: true }) username!: string;
  @Column({ name: 'password_hash', length: 256 }) passwordHash!: string;
  @Column({ length: 64 }) salt!: string;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date;
}
