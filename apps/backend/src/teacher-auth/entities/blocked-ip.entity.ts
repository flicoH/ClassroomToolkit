import { Entity, PrimaryColumn } from 'typeorm';
/** 精确 IP 封禁独立保存，不影响管理员认证。 */
@Entity('blocked_login_ips')
export class BlockedIpEntity {
  @PrimaryColumn({ length: 45 }) ip!: string;
}
