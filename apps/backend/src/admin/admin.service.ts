import { pbkdf2Sync, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminDatabase } from './admin.database';
import { AdminQueryDto, ResetTeacherPasswordDto } from './admin.dto';
import type { AdminMetadata, AdminDirectory } from './admin.types';
import { dateRange, pageQuery, shanghaiDay } from './analytics/range';
import { FEATURES } from '../analytics/features';
/** 管理端跨教师查询与账号管理；不复用绑定 TeacherContext 的教师业务查询层。 */
@Injectable()
export class AdminService {
  /** 注入管理持久层，使业务校验与统计结果组装独立于具体数据库查询。 */
  constructor(private readonly database: AdminDatabase) {}
  /** 沿用教师登录的 PBKDF2 参数，每次重置生成新盐，不返回或记录密码。 */
  async resetTeacherPassword(id: string, body: ResetTeacherPasswordDto) {
    const password = body?.password;
    if (
      typeof password !== 'string' ||
      password.length < 6 ||
      password.length > 256
    ) {
      throw new BadRequestException('密码长度须为 6–256 位');
    }
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(password, salt, 120_000, 64, 'sha512').toString(
      'hex',
    );
    const updated = await this.database.resetTeacherPassword(id, hash, salt);
    if (!updated) throw new NotFoundException('教师不存在');
    return { reset: true };
  }
  /** 采集起点由迁移保存，不能用第一条事件时间替代，以免将尚无使用误判为未采集。 */
  async metadata(): Promise<AdminMetadata> {
    const [row] = await this.database.findMetadata();
    return {
      startedAt: row?.startedAt ? String(row.startedAt) : null,
      timezone: 'Asia/Shanghai',
      updatedAt: new Date().toISOString(),
    };
  }
  /** 学生数只统计学生主表档案；其他课堂工具的学生副本及管理员账号不计入。 */
  async overview() {
    const today = dateRange({ start: shanghaiDay(), end: shanghaiDay() });
    const [row] = await this.database.findOverview(today);
    return {
      ...Object.fromEntries(
        Object.entries(row ?? {}).map(([k, v]) => [k, Number(v)]),
      ),
      ...(await this.metadata()),
    };
  }
  /** 注册趋势基于现存教师账号；先转换历史存储时区，再按北京时间分日。 */
  async registrations(q: AdminQueryDto) {
    const range = dateRange(q);
    const rows = await this.database.findRegistrationDays(range);
    const [baseline] = await this.database.countRegistrationsBefore(range.from);
    // 加上所选范围之前的账号数，累计曲线才不会在每次切换日期后重新从零开始。
    let cumulative = Number(baseline!.count);
    const series = range.days.map((date) => {
      const count = Number(rows.find((r) => r.date === date)?.count || 0);
      cumulative += count;
      return { date, count, cumulative };
    });
    return {
      series,
      total: series.reduce((sum, r) => sum + r.count, 0),
      ...(await this.metadata()),
    };
  }
  /** 主动登录、自动登录、失败与有效使用分别聚合；整个周期独立去重，不能累加每日人数。 */
  async logins(q: AdminQueryDto) {
    const r = dateRange(q);
    const rows = await this.database.findLoginDays(r, q.teacherId);
    const [total] = await this.database.findLoginTotals(r, q.teacherId);
    const meta = await this.metadata();
    const firstDay = meta.startedAt
      ? shanghaiDay(new Date(meta.startedAt))
      : null;
    const series = r.days.map((date) => {
      const row = rows.find((x) => x.date === date);
      return {
        date,
        ...Object.fromEntries(
          [
            'logins',
            'teachers',
            'failures',
            'autoLogins',
            'activeTeachers',
          ].map((key) => [
            key,
            !firstDay || date < firstDay ? null : Number(row?.[key] || 0),
          ]),
        ),
      };
    });
    return {
      hasCoverage: Boolean(
        meta.startedAt &&
        new Date(meta.startedAt).getTime() <
          new Date(r.to.replace(' ', 'T') + 'Z').getTime(),
      ),
      series,
      totals: Object.fromEntries(
        Object.entries(total ?? {}).map(([k, v]) => [k, Number(v || 0)]),
      ),
      ...meta,
    };
  }
  /** 分页返回持久化登录事件，退出或会话过期不会删除这些历史记录。 */
  async loginRecords(q: AdminQueryDto) {
    const r = dateRange(q),
      p = pageQuery(q);
    if (q.kind && !['login', 'login_failed', 'auto_login'].includes(q.kind))
      throw new BadRequestException('无效的登录类型');
    return this.database.findLoginRecords(q, r, p);
  }
  /** 默认按使用教师数识别热门功能；使用率分母为同一周期有效使用的去重教师数。 */
  async features(q: AdminQueryDto) {
    const r = dateRange(q);
    const current = await this.database.findFeatureUsage(
      r.from,
      r.to,
      q.teacherId,
    );
    const previous = await this.database.findFeatureUsage(
      r.previousFrom,
      r.previousTo,
      q.teacherId,
    );
    const [active] = await this.database.countActiveTeachers(r, q.teacherId);
    const meta = await this.metadata();
    // 只有上一等长周期完全落在采集开始之后，才展示环比，避免缺失历史造成虚假增长。
    const comparable = Boolean(
      meta.startedAt &&
      new Date(meta.startedAt).getTime() <=
        new Date(r.previousFrom.replace(' ', 'T') + 'Z').getTime(),
    );
    const items = Object.entries(FEATURES).map(([key, name]) => {
      const row = current.find((x) => x.feature === key),
        prev = previous.find((x) => x.feature === key);
      const teachers = Number(row?.teachers || 0),
        previousTeachers = Number(prev?.teachers || 0);
      return {
        key,
        name,
        teachers,
        uses: Number(row?.uses || 0),
        openTeachers: Number(row?.openTeachers || 0),
        usageRate: Number(active!.count) ? teachers / Number(active!.count) : 0,
        previousTeachers,
        change: !comparable
          ? '无完整对比数据'
          : previousTeachers
            ? `${(((teachers - previousTeachers) / previousTeachers) * 100).toFixed(1)}%`
            : teachers
              ? '新增使用'
              : '—',
      };
    });
    items.sort((a, b) =>
      q.sort === 'uses' ? b.uses - a.uses : b.teachers - a.teachers,
    );
    return {
      hasCoverage: Boolean(
        meta.startedAt &&
        new Date(meta.startedAt).getTime() <
          new Date(r.to.replace(' ', 'T') + 'Z').getTime(),
      ),
      items,
      activeTeachers: Number(active!.count),
      ...meta,
    };
  }
  /** 补齐范围内的每一天；未开始采集的日期返回 null，已采集但无使用的日期返回 0。 */
  async featureTrend(key: string, q: AdminQueryDto) {
    if (!Object.hasOwn(FEATURES, key))
      throw new BadRequestException('未知功能');
    const r = dateRange(q);
    const rows = await this.database.findFeatureDays(key, r, q.teacherId);
    const meta = await this.metadata(),
      firstDay = meta.startedAt ? shanghaiDay(new Date(meta.startedAt)) : null;
    return {
      name: FEATURES[key],
      series: r.days.map((date) => {
        const row = rows.find((x) => x.date === date);
        return {
          date,
          uses: !firstDay || date < firstDay ? null : Number(row?.uses || 0),
          teachers:
            !firstDay || date < firstDay ? null : Number(row?.teachers || 0),
        };
      }),
      ...meta,
    };
  }
  /** 校验分页和日期范围，再委托持久层读取只读目录。 */
  async list(kind: AdminDirectory, q: AdminQueryDto) {
    const pagination = pageQuery(q);
    const range =
      kind === 'teachers' && (q.start || q.end) ? dateRange(q) : undefined;
    return this.database.findDirectory(kind, q, pagination, range);
  }
  /** 详情只暴露展示字段，并将登录与功能查询限定到指定教师。 */
  async teacher(id: string, q: AdminQueryDto) {
    const [profile] = await this.database.findTeacherById(id);
    if (!profile) throw new NotFoundException('教师不存在');
    const [stats] = await this.database.findTeacherStats(id);
    return {
      ...profile,
      ...stats,
      logins: await this.logins({ ...q, teacherId: id }),
      features: await this.features({ ...q, teacherId: id, sort: 'uses' }),
    };
  }
}
