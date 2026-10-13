import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Not } from 'typeorm';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { TeacherEntity } from '../teacher-auth/entities/teacher.entity';
import { TeacherSessionEntity } from '../teacher-auth/entities/teacher-session.entity';
import { dateRange, pageQuery } from '../admin/analytics/range';
import { AdminQueryDto } from '../admin/admin.dto';
import {
  teacherSqlTime,
  teacherUtcOffset,
} from '../admin/analytics/teacher-time';
import { FEATURES } from '../analytics/features';

/** 主账号归属从认证上下文传入；密码和完整实体不出现在返回值中。 */
@Injectable()
export class AccountManagementService {
  constructor(private readonly source: DataSource) {}

  private profile(row: TeacherEntity) {
    return {
      id: row.id,
      displayName: row.name,
      account: row.username,
      status: row.status,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
    };
  }
  private text(value: unknown, label: string) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 64)
      throw new BadRequestException(`${label}须为 1–64 字`);
    return value.trim();
  }
  private password(value: unknown) {
    if (typeof value !== 'string' || value.length < 6 || value.length > 256)
      throw new BadRequestException('密码长度须为 6–256 位');
    const passwordSalt = randomBytes(16).toString('hex');
    return {
      passwordSalt,
      passwordHash: pbkdf2Sync(
        value,
        passwordSalt,
        120000,
        64,
        'sha512',
      ).toString('hex'),
    };
  }
  private async owner(manager: EntityManager, id: string, lock = false) {
    const row = await manager.findOne(TeacherEntity, {
      where: { id },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!row || row.parentAccountId || row.status !== 'active')
      throw new ForbiddenException('此操作仅限可用主账号');
    return row;
  }
  private async target(manager: EntityManager, ownerId: string, id: string) {
    const row = await manager.findOne(TeacherEntity, {
      where: { id, parentAccountId: ownerId },
    });
    if (!row) throw new NotFoundException('子账号不存在');
    return row;
  }
  private async audit(
    manager: EntityManager,
    ownerId: string,
    targetId: string,
    action: string,
  ) {
    // 安全审计与修改同事务，写入失败则整个操作回滚；绝不记录密码。
    await manager.query(
      'INSERT INTO account_management_audit (id, owner_account_id, actor_account_id, target_account_id, action, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))',
      [randomUUID(), ownerId, ownerId, targetId, action],
    );
  }
  async list(ownerId: string) {
    await this.owner(this.source.manager, ownerId);
    const rows = await this.source.manager.find(TeacherEntity, {
      where: { parentAccountId: ownerId },
      order: { createdAt: 'DESC' },
    });
    const items = await Promise.all(
      rows.map(async (row) => {
        const [last] = await this.source.query(
          "SELECT DATE_FORMAT(MAX(created_at), '%Y-%m-%dT%H:%i:%s.000Z') AS lastLoginAt FROM analytics_events WHERE teacher_id = ? AND kind IN ('login', 'auto_login')",
          [row.id],
        );
        return { ...this.profile(row), lastLoginAt: last?.lastLoginAt ?? null };
      }),
    );
    return {
      items,
      used: rows.filter((row) => row.status !== 'deleted').length,
      limit: 5,
    };
  }
  async create(ownerId: string, body: Record<string, unknown>) {
    const name = this.text(body?.displayName, '用户名'),
      username = this.text(body?.account, '账号');
    if (/\s/.test(username)) throw new BadRequestException('账号不能包含空白');
    const credentials = this.password(body?.password);
    try {
      return await this.source.transaction(async (manager) => {
        // 锁同一主账号行，使所有创建/删除共用额度锁，并发也不能超过五个。
        await this.owner(manager, ownerId, true);
        if (
          (await manager.count(TeacherEntity, {
            where: { parentAccountId: ownerId, status: Not('deleted') },
          })) >= 5
        )
          throw new ConflictException('最多创建 5 个子账号，锁定账号仍占名额');
        const row = manager.create(TeacherEntity, {
          id: randomUUID(),
          name,
          username,
          parentAccountId: ownerId,
          status: 'active',
          email: '',
          avatar: '',
          ...credentials,
        });
        const saved = await manager.save(row);
        await this.audit(manager, ownerId, row.id, 'create');
        return this.profile(saved);
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new ConflictException('账号已存在');
      throw error;
    }
  }
  async change(
    ownerId: string,
    id: string,
    action: 'name' | 'password' | 'status' | 'delete',
    body: Record<string, unknown> = {},
  ) {
    // 在加锁前完成密码哈希，缩短额度锁持有时间。
    const credentials =
      action === 'password' ? this.password(body?.password) : null;
    const name =
      action === 'name' ? this.text(body?.displayName, '用户名') : null;
    if (
      action === 'status' &&
      !['active', 'locked'].includes(String(body?.status))
    )
      throw new BadRequestException('无效账号状态');
    return this.source.transaction(async (manager) => {
      await this.owner(manager, ownerId, true);
      const row = await this.target(manager, ownerId, id);
      if (row.status === 'deleted') {
        if (action === 'delete') return { deleted: true };
        throw new NotFoundException('子账号已删除');
      }
      if (name !== null) row.name = name;
      if (credentials) Object.assign(row, credentials);
      if (action === 'status') row.status = body.status as 'active' | 'locked';
      if (action === 'delete') {
        row.status = 'deleted';
        row.deletedAt = new Date();
      }
      if (action !== 'name') row.sessionVersion = (row.sessionVersion || 0) + 1;
      await manager.save(row);
      if (action !== 'name')
        await manager.delete(TeacherSessionEntity, { teacherId: row.id });
      await this.audit(
        manager,
        ownerId,
        id,
        action === 'status' ? row.status : action,
      );
      return this.profile(row);
    });
  }
  async usage(
    ownerId: string,
    id: string,
    q: AdminQueryDto,
    admin = false,
    team = false,
  ) {
    if (!admin) {
      await this.owner(this.source.manager, ownerId);
      if (!team) await this.target(this.source.manager, ownerId, id);
    }
    const range = dateRange(q),
      args = [id, range.from, range.to];
    const scope = `${team ? 'owner_account_id' : 'teacher_id'} = ? AND created_at >= ? AND created_at < ?`;
    const [totals, features, hours, days, reportActions] = await Promise.all([
      this.source.query(
        `SELECT SUM(kind = 'login') AS logins, SUM(kind = 'auto_login') AS autoLogins, SUM(kind = 'login_failed') AS failures, SUM(kind = 'open') AS opens, SUM(kind = 'use') AS uses, COUNT(DISTINCT CASE WHEN kind = 'use' THEN DATE(DATE_ADD(created_at, INTERVAL 8 HOUR)) END) AS activeDays FROM analytics_events WHERE ${scope}`,
        args,
      ),
      this.source.query(
        `SELECT feature, report_version AS reportVersion, SUM(kind = 'use') AS uses, SUM(kind = 'open') AS opens FROM analytics_events WHERE ${scope} AND kind IN ('open', 'use') GROUP BY feature, report_version ORDER BY uses DESC`,
        args,
      ),
      this.source.query(
        `SELECT HOUR(DATE_ADD(created_at, INTERVAL 8 HOUR)) AS hour, COUNT(*) AS uses FROM analytics_events WHERE ${scope} AND kind = 'use' GROUP BY hour ORDER BY hour`,
        args,
      ),
      this.source.query(
        `SELECT DATE_FORMAT(DATE_ADD(created_at, INTERVAL 8 HOUR), '%Y-%m-%d') AS date, COUNT(*) AS uses FROM analytics_events WHERE ${scope} AND kind = 'use' GROUP BY date ORDER BY date`,
        args,
      ),
      this.source.query(
        `SELECT action, COUNT(*) AS count FROM semester_report_events WHERE ${team ? 'teacher_id = ?' : 'actor_account_id = ?'} AND actor_type IN ('main', 'sub') AND created_at >= ? AND created_at < ? GROUP BY action`,
        [id, teacherSqlTime(range.from), teacherSqlTime(range.to)],
      ),
    ]);
    return {
      timezone: 'Asia/Shanghai',
      start: range.start,
      end: range.end,
      totals: Object.fromEntries(
        Object.entries(totals[0] || {}).map(([key, value]) => [
          key,
          Number(value || 0),
        ]),
      ),
      features: features.map(
        (row: { feature: string; uses: string; opens: string }) => ({
          ...row,
          name: FEATURES[row.feature] || row.feature,
          uses: Number(row.uses || 0),
          opens: Number(row.opens || 0),
        }),
      ),
      hours: hours.map((row: { hour: number; uses: string }) => ({
        hour: Number(row.hour),
        uses: Number(row.uses),
      })),
      days: days.map((row: { date: string; uses: string }) => ({
        date: row.date,
        uses: Number(row.uses),
      })),
      reportActions: reportActions.map(
        (row: { action: string; count: string }) => ({
          action: row.action,
          count: Number(row.count),
        }),
      ),
    };
  }
  async activity(ownerId: string, id: string, q: AdminQueryDto, team = false) {
    await this.owner(this.source.manager, ownerId);
    if (!team) await this.target(this.source.manager, ownerId, id);
    const range = dateRange(q),
      page = pageQuery(q),
      args = [id, teacherSqlTime(range.from), teacherSqlTime(range.to)];
    const scope = `${team ? 'teacher_id' : 'actor_account_id'} = ? AND actor_type IN ('main', 'sub') AND created_at >= ? AND created_at < ?`;
    const [total] = await this.source.query(
      `SELECT COUNT(*) AS count FROM semester_report_events WHERE ${scope}`,
      args,
    );
    const items = await this.source.query(
      `SELECT id, report_id AS reportId, actor_name_snapshot AS displayName, action, DATE_FORMAT(CONVERT_TZ(created_at, ?, '+00:00'), '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt FROM semester_report_events WHERE ${scope} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [teacherUtcOffset(), ...args, page.pageSize, page.offset],
    );
    return {
      items,
      total: Number(total.count),
      page: page.page,
      pageSize: page.pageSize,
    };
  }
}
