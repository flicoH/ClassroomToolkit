import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAccountEntity } from './entities/admin-account.entity';
import { AdminSessionEntity } from './entities/admin-session.entity';
import type { AdminAccount, AdminProfile } from './admin-auth.types';
/** 身份持久层只负责账户与会话读写，密码派生、限流和身份异常由 Service 处理。 */
@Injectable()
export class AdminAuthDatabase {
  /** 注入管理员账号与会话仓库，与教师认证表保持独立。 */
  constructor(
    @InjectRepository(AdminAccountEntity)
    private readonly accounts: Repository<AdminAccountEntity>,
    @InjectRepository(AdminSessionEntity)
    private readonly sessions: Repository<AdminSessionEntity>,
  ) {}
  /** 检查是否已有管理员，供首次启动初始化判断使用。 */
  async hasAccounts(): Promise<boolean> {
    return this.accounts.exists();
  }
  /** 插入已由 Service 完成密码派生的账号，不在持久层处理明文密码。 */
  async createAccount(account: AdminAccount): Promise<void> {
    await this.accounts.insert(this.accounts.create(account));
  }
  /** 根据账号名查询认证资料并映射为内部类型；不存在时返回 undefined。 */
  async findByUsername(username: string): Promise<AdminAccount | undefined> {
    const entity = await this.accounts.findOne({ where: { username } });
    return entity
      ? {
          id: entity.id,
          username: entity.username,
          passwordHash: entity.passwordHash,
          salt: entity.salt,
        }
      : undefined;
  }
  /** 按数据库 UTC 时钟删除过期会话，避免依赖应用服务器的本地时间。 */
  async deleteExpiredSessions(): Promise<void> {
    await this.sessions
      .createQueryBuilder()
      .delete()
      .where('expires_at < UTC_TIMESTAMP(3)')
      .execute();
  }
  /** 会话过期时间沿用数据库 UTC 时钟，避免应用服务器本地时区改变有效期。 */
  async createSession(tokenHash: string, adminId: string): Promise<void> {
    await this.sessions
      .createQueryBuilder()
      .insert()
      .values({
        tokenHash,
        adminId,
        expiresAt: () => 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 8 HOUR)',
      })
      .execute();
  }
  /** 通过令牌摘要关联管理员，仅返回尚未过期会话对应的展示资料。 */
  async findActiveProfile(
    tokenHash: string,
  ): Promise<AdminProfile | undefined> {
    return this.sessions
      .createQueryBuilder('session')
      .innerJoin('session.admin', 'account')
      .select('account.id', 'id')
      .addSelect('account.username', 'username')
      .where('session.token_hash = :tokenHash', { tokenHash })
      .andWhere('session.expires_at > UTC_TIMESTAMP(3)')
      .getRawOne<AdminProfile>();
  }
  /** 按令牌摘要删除指定管理会话，不影响其他登录会话。 */
  async deleteSession(tokenHash: string): Promise<void> {
    await this.sessions.delete({ tokenHash });
  }
}
