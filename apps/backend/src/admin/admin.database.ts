import { BlockedIpEntity } from '../teacher-auth/entities/blocked-ip.entity';
import { TeacherSessionEntity } from '../teacher-auth/entities/teacher-session.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  type ObjectLiteral,
  type SelectQueryBuilder,
} from 'typeorm';
import { TeacherEntity } from '../teacher-auth/entities/teacher.entity';
import { StudentEntity } from '../students/entities/student.entity';
import { ClassroomEntity } from '../students/entities/classroom.entity';
import { AnalyticsEventEntity } from '../analytics/entities/analytics-event.entity';
import { AnalyticsSettingEntity } from '../analytics/entities/analytics-setting.entity';
import { AdminQueryDto } from './admin.dto';
import type {
  AdminDatabaseRow,
  AdminDirectory,
  AdminPagination,
  AdminDateRange,
} from './admin.types';
import { teacherSqlTime, teacherUtcOffset } from './analytics/teacher-time';
import { FeedbackEntity } from '../feedback/entities/feedback.entity';
import { ReportAiSettingEntity } from './entities/report-ai-setting.entity';
import { ReportAiTeacherPermissionEntity } from './entities/report-ai-teacher-permission.entity';
import {
  SemesterReportEntity,
  SemesterReportTokenCallEntity,
} from '../semester-reports/semester-report.entity';
import { extractCallFromAiResponse } from '../database/scripts/backfill-report-token-calls';

const eventDay =
  "DATE_FORMAT(DATE_ADD(e.createdAt, INTERVAL 8 HOUR), '%Y-%m-%d')";
/** 将内部指定的数据库时间表达式格式化为 UTC ISO 字符串；column 不接收客户端输入。 */
const isoDate = (column: string) =>
  `DATE_FORMAT(${column}, '%Y-%m-%dT%H:%i:%s.000Z')`;
const loginCounts = [
  ["SUM(e.kind = 'login')", 'logins'],
  [
    "COUNT(DISTINCT CASE WHEN e.kind = 'login' THEN e.teacherId END)",
    'teachers',
  ],
  ["SUM(e.kind = 'login_failed')", 'failures'],
  ["SUM(e.kind = 'auto_login')", 'autoLogins'],
  [
    "COUNT(DISTINCT CASE WHEN e.kind = 'use' THEN e.teacherId END)",
    'activeTeachers',
  ],
] as const;

/** 持久层只负责 Repository / QueryBuilder 查询；统计口径和参数校验由 Service 维护。 */
@Injectable()
export class AdminDatabase {
  /** 注入教师、学生、班级与统计实体仓库，管理查询显式跨教师读取。 */
  constructor(
    @InjectRepository(TeacherEntity)
    private readonly teachers: Repository<TeacherEntity>,
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
    @InjectRepository(ClassroomEntity)
    private readonly classrooms: Repository<ClassroomEntity>,
    @InjectRepository(AnalyticsEventEntity)
    private readonly events: Repository<AnalyticsEventEntity>,
    @InjectRepository(AnalyticsSettingEntity)
    private readonly settings: Repository<AnalyticsSettingEntity>,
    @InjectRepository(FeedbackEntity)
    private readonly feedback: Repository<FeedbackEntity>,
  ) {}
  reportAiSettings() {
    return this.teachers.manager.getRepository(ReportAiSettingEntity);
  }

  listBlockedIps() {
    return this.teachers.manager.find(BlockedIpEntity, {
      order: { ip: 'ASC' },
    });
  }
  async updateBlockedIp(ip: string, remove: boolean) {
    if (remove) await this.teachers.manager.delete(BlockedIpEntity, { ip });
    else await this.teachers.manager.upsert(BlockedIpEntity, { ip }, ['ip']);
    return { updated: true };
  }
  /** 关联教师展示信息并按提交时间倒序返回意见。 */
  async findFeedback(q: AdminQueryDto, page: AdminPagination) {
    const query = this.feedback
      .createQueryBuilder('f')
      .leftJoin(TeacherEntity, 't', 't.id = f.teacherId');
    if (q.search) {
      query.andWhere(
        '(f.content LIKE :search OR t.name LIKE :search OR t.username LIKE :search)',
        { search: `%${q.search.slice(0, 100)}%` },
      );
    }
    const total = await query.getCount();
    const items = await query
      .select('f.id', 'id')
      .addSelect('f.teacherId', 'teacherId')
      .addSelect('t.name', 'teacherName')
      .addSelect('t.username', 'teacherUsername')
      .addSelect('f.content', 'content')
      .addSelect(isoDate('f.createdAt'), 'createdAt')
      .orderBy('f.createdAt', 'DESC')
      .addOrderBy('f.id', 'DESC')
      .limit(page.pageSize)
      .offset(page.offset)
      .getRawMany<AdminDatabaseRow>();
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  /** 在同一事务中更新密码并撤销会话；教师不存在时不修改任何数据。 */
  async resetTeacherPassword(
    id: string,
    passwordHash: string,
    passwordSalt: string,
  ) {
    return this.teachers.manager.transaction(async (manager) => {
      const result = await manager.update(
        TeacherEntity,
        { id },
        { passwordHash, passwordSalt },
      );
      if (!result.affected) return false;
      await manager.delete(TeacherSessionEntity, { teacherId: id });
      return true;
    });
  }

  /** 在同一事务中更新教师账号锁定状态与锁定时间；若锁定则清空其有效会话。 */
  async updateTeacherLock(id: string, locked: boolean) {
    return this.teachers.manager.transaction(async (manager) => {
      const result = await manager.update(
        TeacherEntity,
        { id },
        {
          status: locked ? 'locked' : 'active',
          lockedAt: locked ? new Date() : null,
        },
      );
      if (!result.affected) return false;
      if (locked) {
        await manager.delete(TeacherSessionEntity, { teacherId: id });
      }
      return true;
    });
  }

  /**
   * 在同一事务中彻底删除指定教师及其名下全部业务数据和会话。
   * 遵循各模块数据隔离与外键约束，先清理从属业务表，最后删除教师主表。
   */
  async deleteTeacher(id: string) {
    return this.teachers.manager.transaction(async (manager) => {
      const teacher = await manager.findOne(TeacherEntity, { where: { id } });
      if (!teacher) return false;

      const businessTables = [
        'teacher_auth_sessions',
        'teacher_feedback',
        'admin_report_ai_teacher_permissions',
        'countdown_states',
        'sticky_notes_notes',
        'gacha_machine_draw_records',
        'gacha_machine_rewards',
        'random_picker_history_students',
        'random_picker_histories',
        'random_picker_students',
        'random_picker_classes',
        'seating_chart_seats',
        'seating_chart_students',
        'seating_chart_charts',
        'task_stats_students',
        'task_stats_tasks',
        'pet_points_redemptions',
        'pet_points_evaluation_records',
        'pet_points_rewards',
        'pet_points_rubrics',
        'pet_points_settings',
        'pet_points_students',
        'semester_report_token_calls',
        'semester_report_events',
        'semester_report_shares',
        'semester_reports',
        'semester_report_documents',
        'semester_report_subjects',
        'semester_report_terms',
        'student_students',
        'student_groups',
        'student_classrooms',
      ];

      for (const table of businessTables) {
        await manager.query(`DELETE FROM \`${table}\` WHERE teacher_id = ?`, [
          id,
        ]);
      }

      await manager.delete(TeacherEntity, { id });
      return true;
    });
  }

  /** 列出全部教师的简要信息，供授权选择组件使用。 */
  async listActiveTeachers() {
    return this.teachers
      .createQueryBuilder('t')
      .select('t.id', 'id')
      .addSelect('t.name', 'name')
      .addSelect('t.username', 'username')
      .addSelect('t.status', 'status')
      .orderBy('t.createdAt', 'DESC')
      .getRawMany<AdminDatabaseRow>();
  }

  /** 列出所有已授权 AI 报告权限的教师信息。 */
  async listReportAiTeacherPermissions() {
    return this.teachers.manager
      .createQueryBuilder(ReportAiTeacherPermissionEntity, 'p')
      .innerJoin(TeacherEntity, 't', 't.id = p.teacherId')
      .select('p.teacherId', 'teacherId')
      .addSelect('t.name', 'teacherName')
      .addSelect('t.username', 'teacherUsername')
      .addSelect(isoDate('p.createdAt'), 'createdAt')
      .orderBy('p.createdAt', 'DESC')
      .getRawMany<AdminDatabaseRow>();
  }

  /** 检查指定教师是否拥有 AI 报告权限。 */
  async hasReportAiTeacherPermission(teacherId: string): Promise<boolean> {
    return this.teachers.manager.existsBy(ReportAiTeacherPermissionEntity, {
      teacherId,
    });
  }

  /** 为指定教师设置或撤销 AI 报告权限。 */
  async setReportAiTeacherPermission(teacherId: string, enabled: boolean) {
    const teacher = await this.teachers.findOne({ where: { id: teacherId } });
    if (!teacher) return false;
    if (enabled) {
      await this.teachers.manager
        .createQueryBuilder()
        .insert()
        .into(ReportAiTeacherPermissionEntity)
        .values({ teacherId })
        .orIgnore()
        .execute();
    } else {
      await this.teachers.manager.delete(ReportAiTeacherPermissionEntity, {
        teacherId,
      });
    }
    return true;
  }

  /** 统一使用 UTC 字符串边界，避免驱动再次按本机时区转换事件时间。 */
  private eventQuery(range: AdminDateRange, teacherId?: string) {
    const query = this.events
      .createQueryBuilder('e')
      .where('e.createdAt >= :from AND e.createdAt < :to', range);
    if (teacherId) query.andWhere('e.teacherId = :teacherId', { teacherId });
    return query;
  }
  /** 构建共享的登录聚合字段，供每日趋势和全周期独立去重查询复用。 */
  private loginQuery(range: AdminDateRange, teacherId?: string) {
    const query = this.eventQuery(range, teacherId).select([]);
    for (const [expression, alias] of loginCounts)
      query.addSelect(expression, alias);
    return query;
  }
  /** 读取迁移保存的采集起始时间，并转换为 UTC ISO 字符串。 */
  findMetadata() {
    return this.settings
      .createQueryBuilder('s')
      .select(isoDate('s.startedAt'), 'startedAt')
      .where('s.id = :id', { id: 1 })
      .getRawMany<AdminDatabaseRow>();
  }
  /** 并行读取各实体总量及今日指标，学生数量仅取学生主表。 */
  async findOverview(today: AdminDateRange) {
    const [
      teachers,
      students,
      classrooms,
      registrationsToday,
      loginRows,
      activeRows,
    ] = await Promise.all([
      this.teachers.count(),
      this.students.count(),
      this.classrooms.count(),
      this.teachers
        .createQueryBuilder('t')
        .where('t.createdAt >= :from AND t.createdAt < :to', {
          from: teacherSqlTime(today.from),
          to: teacherSqlTime(today.to),
        })
        .getCount(),
      this.eventQuery(today)
        .select('COUNT(DISTINCT e.teacherId)', 'count')
        .andWhere('e.kind = :kind', { kind: 'login' })
        .getRawMany<AdminDatabaseRow>(),
      this.countActiveTeachers(today),
    ]);
    return [
      {
        teachers,
        students,
        classrooms,
        registrationsToday,
        loginTeachersToday: Number(loginRows[0]?.count ?? 0),
        activeTeachersToday: Number(activeRows[0]?.count ?? 0),
      },
    ];
  }
  /** 按历史教师字段时区筛选，并转换为北京时间分组统计注册数量。 */
  findRegistrationDays(range: AdminDateRange) {
    return this.teachers
      .createQueryBuilder('t')
      .select(
        "DATE_FORMAT(CONVERT_TZ(t.createdAt, :offset, '+08:00'), '%Y-%m-%d')",
        'date',
      )
      .addSelect('COUNT(*)', 'count')
      .setParameter('offset', teacherUtcOffset())
      .where('t.createdAt >= :from AND t.createdAt < :to', {
        from: teacherSqlTime(range.from),
        to: teacherSqlTime(range.to),
      })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<AdminDatabaseRow>();
  }
  /** 统计查询范围之前注册的现存账号，作为累计曲线的起始基数。 */
  countRegistrationsBefore(from: string) {
    return this.teachers
      .createQueryBuilder('t')
      .select('COUNT(*)', 'count')
      .where('t.createdAt < :from', { from: teacherSqlTime(from) })
      .getRawMany<AdminDatabaseRow>();
  }
  /** 按北京时间分日聚合登录和活跃指标，可限定单个教师。 */
  findLoginDays(range: AdminDateRange, teacherId?: string) {
    return this.loginQuery(range, teacherId)
      .addSelect(eventDay, 'date')
      .groupBy('date')
      .getRawMany<AdminDatabaseRow>();
  }
  /** 在完整日期范围内聚合并去重，不通过累加每日人数计算周期人数。 */
  findLoginTotals(range: AdminDateRange, teacherId?: string) {
    return this.loginQuery(range, teacherId).getRawMany<AdminDatabaseRow>();
  }
  /** 筛选持久化登录事件，关联可展示的教师资料并按时间倒序分页。 */
  async findLoginRecords(
    q: AdminQueryDto,
    range: AdminDateRange,
    page: AdminPagination,
  ) {
    const query = this.eventQuery(range, q.teacherId).andWhere(
      'e.kind IN (:...kinds)',
      { kinds: ['login', 'login_failed', 'auto_login'] },
    );
    if (q.kind) query.andWhere('e.kind = :kind', { kind: q.kind });
    const total = await query.getCount();
    const items = await query
      .leftJoin(TeacherEntity, 't', 't.id = e.teacherId')
      .select('e.id', 'id')
      .addSelect('e.teacherId', 'teacherId')
      .addSelect('t.name', 'name')
      .addSelect('t.username', 'username')
      .addSelect('e.loginIp', 'loginIp')
      .addSelect('e.ipLocation', 'ipLocation')
      .addSelect('e.kind', 'kind')
      .addSelect(isoDate('e.createdAt'), 'createdAt')
      .orderBy('e.createdAt', 'DESC')
      .addOrderBy('e.id', 'DESC')
      .limit(page.pageSize)
      .offset(page.offset)
      .getRawMany<AdminDatabaseRow>();
    return { items, total, page: page.page, pageSize: page.pageSize };
  }
  /** 按功能聚合有效使用次数、使用教师数和打开教师数，供本期与上期比较。 */
  findFeatureUsage(from: string, to: string, teacherId?: string) {
    return this.eventQuery({ from, to }, teacherId)
      .select('e.feature', 'feature')
      .addSelect("SUM(e.kind = 'use')", 'uses')
      .addSelect(
        "COUNT(DISTINCT CASE WHEN e.kind = 'use' THEN e.teacherId END)",
        'teachers',
      )
      .addSelect(
        "COUNT(DISTINCT CASE WHEN e.kind = 'open' THEN e.teacherId END)",
        'openTeachers',
      )
      .andWhere('e.kind IN (:...kinds)', { kinds: ['open', 'use'] })
      .groupBy('e.feature')
      .getRawMany<AdminDatabaseRow>();
  }
  /** 统计日期范围内发生有效使用的去重教师数，作为功能使用率的分母。 */
  countActiveTeachers(range: AdminDateRange, teacherId?: string) {
    return this.eventQuery(range, teacherId)
      .select('COUNT(DISTINCT e.teacherId)', 'count')
      .andWhere('e.kind = :kind', { kind: 'use' })
      .getRawMany<AdminDatabaseRow>();
  }
  /** 按北京时间聚合指定功能的有效操作次数与去重教师数。 */
  findFeatureDays(key: string, range: AdminDateRange, teacherId?: string) {
    return this.eventQuery(range, teacherId)
      .select(eventDay, 'date')
      .addSelect('COUNT(*)', 'uses')
      .addSelect('COUNT(DISTINCT e.teacherId)', 'teachers')
      .andWhere('e.feature = :feature AND e.kind = :kind', {
        feature: key,
        kind: 'use',
      })
      .groupBy('date')
      .getRawMany<AdminDatabaseRow>();
  }

  /** 明确选择可展示字段；不将完整教师实体及密码派生字段暴露给管理页面。 */
  private teacherQuery() {
    return this.teachers
      .createQueryBuilder('t')
      .select('t.id', 'id')
      .addSelect('t.username', 'username')
      .addSelect('t.name', 'name')
      .addSelect('t.email', 'email')
      .addSelect('t.status', 'status')
      .addSelect(
        isoDate("CONVERT_TZ(t.lockedAt, :offset, '+00:00')"),
        'lockedAt',
      )
      .addSelect(
        isoDate("CONVERT_TZ(t.createdAt, :offset, '+00:00')"),
        'createdAt',
      )
      .setParameter('offset', teacherUtcOffset());
  }
  /** 用聚合子查询避免直接连学生表后重复计算教师或班级行数。 */
  private addTeacherStats(query: SelectQueryBuilder<TeacherEntity>) {
    return query
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)')
            .from(ClassroomEntity, 'c')
            .where('c.teacherId = t.id'),
        'classrooms',
      )
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)')
            .from(StudentEntity, 's')
            .where('s.teacherId = t.id'),
        'students',
      )
      .addSelect(
        (sub) =>
          sub
            .select(isoDate('MAX(e.createdAt)'))
            .from(AnalyticsEventEntity, 'e')
            .where('e.teacherId = t.id')
            .andWhere("e.kind IN ('login', 'auto_login')"),
        'lastLoginAt',
      );
  }
  /** 按固定目录类型构建筛选与分页查询，关联查询不放大教师或班级数量。 */
  async findDirectory(
    kind: AdminDirectory,
    q: AdminQueryDto,
    page: AdminPagination,
    range?: AdminDateRange,
  ) {
    let query: SelectQueryBuilder<ObjectLiteral>;
    if (kind === 'teachers') {
      query = this.addTeacherStats(this.teacherQuery());
      if (q.search)
        query.andWhere('(t.name LIKE :search OR t.username LIKE :search)', {
          search: `%${q.search.slice(0, 100)}%`,
        });
      if (range)
        query.andWhere('t.createdAt >= :from AND t.createdAt < :to', {
          from: teacherSqlTime(range.from),
          to: teacherSqlTime(range.to),
        });
    } else {
      query =
        kind === 'students'
          ? this.students.createQueryBuilder('t')
          : this.classrooms.createQueryBuilder('t');
      query
        .leftJoin(TeacherEntity, 'a', 'a.id = t.teacherId')
        .select('t.id', 'id')
        .addSelect('t.name', 'name')
        .addSelect('t.teacherId', 'teacherId')
        .addSelect('a.name', 'teacherName');
      if (kind === 'students') {
        query
          .leftJoin(
            ClassroomEntity,
            'c',
            'c.id = t.classroomId AND c.teacherId = t.teacherId',
          )
          .addSelect('t.studentNo', 'studentNo')
          .addSelect('t.gender', 'gender')
          .addSelect('t.classroomId', 'classroomId')
          .addSelect('c.name', 'classroomName');
        if (q.classroomId)
          query.andWhere('t.classroomId = :classroomId', {
            classroomId: q.classroomId,
          });
        if (q.classroomSearch)
          query.andWhere('c.name LIKE :classroomSearch', {
            classroomSearch: `%${q.classroomSearch.slice(0, 100)}%`,
          });
      } else {
        query.addSelect(
          (sub) =>
            sub
              .select('COUNT(*)')
              .from(StudentEntity, 's')
              .where('s.classroomId = t.id AND s.teacherId = t.teacherId'),
          'students',
        );
      }
      if (q.search)
        query.andWhere(
          kind === 'students'
            ? '(t.name LIKE :search OR t.studentNo LIKE :search)'
            : 't.name LIKE :search',
          { search: `%${q.search.slice(0, 100)}%` },
        );
      if (q.teacherSearch)
        query.andWhere(
          '(a.name LIKE :teacherSearch OR a.username LIKE :teacherSearch)',
          { teacherSearch: `%${q.teacherSearch.slice(0, 100)}%` },
        );
      if (q.teacherId)
        query.andWhere('t.teacherId = :teacherId', { teacherId: q.teacherId });
    }
    const total = await query.getCount();
    const items = await query
      .orderBy('t.createdAt', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .limit(page.pageSize)
      .offset(page.offset)
      .getRawMany<AdminDatabaseRow>();
    return { items, total, page: page.page, pageSize: page.pageSize };
  }
  /** 按唯一 ID 查询教师的可展示字段；不存在时返回空数组，由 Service 决定异常。 */
  findTeacherById(id: string) {
    return this.teacherQuery()
      .where('t.id = :id', { id })
      .getRawMany<AdminDatabaseRow>();
  }
  /** 通过聚合子查询读取教师班级数、学生数及最近成功或自动登录时间。 */
  findTeacherStats(id: string) {
    return this.addTeacherStats(
      this.teachers.createQueryBuilder('t').select([]),
    )
      .where('t.id = :id', { id })
      .getRawMany<AdminDatabaseRow>();
  }

  /** 分页查询报告模型 Token 调用汇总及指标统计。 */
  async findReportTokenUsage(
    q: AdminQueryDto,
    range: { from: string; to: string; start: string; end: string },
    page: AdminPagination,
  ) {
    const reportRepo =
      this.teachers.manager.getRepository(SemesterReportEntity);
    const callsRepo = this.teachers.manager.getRepository(
      SemesterReportTokenCallEntity,
    );

    const studentTerm = (q.student || q.search || '').trim().slice(0, 100);
    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);

    const query = reportRepo
      .createQueryBuilder('r')
      .leftJoin(TeacherEntity, 't', 't.id = r.teacherId')
      .where('r.status != :deleted', { deleted: 'deleted' });

    if (studentTerm) {
      const termCondition =
        '(r.studentName LIKE :studentTerm OR r.studentId = :studentExact OR r.studentId LIKE :studentTerm OR r.className LIKE :studentTerm OR t.name LIKE :studentTerm OR t.username LIKE :studentTerm)';
      query.andWhere(termCondition, {
        studentTerm: `%${studentTerm}%`,
        studentExact: studentTerm,
      });
    }

    // 关联满足筛选范围的调用流水
    query.leftJoin(
      SemesterReportTokenCallEntity,
      'c',
      'c.reportId = r.id AND c.calledAt >= :from AND c.calledAt < :to' +
        (q.model ? ' AND c.model = :model' : '') +
        (q.status ? ' AND c.status = :callStatus' : ''),
      {
        from: fromDate,
        to: toDate,
        ...(q.model ? { model: q.model.trim() } : {}),
        ...(q.status ? { callStatus: q.status.trim() } : {}),
      },
    );

    // 若指定了模型或状态，仅保留有对应调用的报告；未指定时同时保留在当前范围内创建的模板生成或无调用的报告
    if (q.model || q.status) {
      query.andWhere('c.id IS NOT NULL');
    } else {
      query.andWhere(
        '(c.id IS NOT NULL OR (r.createdAt >= :from AND r.createdAt < :to))',
        { from: fromDate, to: toDate },
      );
    }

    // 统计满足条件的报告总数
    const countQuery = query.clone();
    const countResult = await countQuery
      .select('COUNT(DISTINCT r.id)', 'count')
      .getRawOne<{ count: string | number }>();
    const total = countResult?.count ? Number(countResult.count) : 0;

    // 汇总当前筛选范围内的总调用次数、各 Token 总数及未知次数
    const summaryQuery = callsRepo
      .createQueryBuilder('c')
      .innerJoin(SemesterReportEntity, 'r', 'r.id = c.reportId')
      .leftJoin(TeacherEntity, 't', 't.id = r.teacherId')
      .where('r.status != :deleted', { deleted: 'deleted' })
      .andWhere('c.calledAt >= :from AND c.calledAt < :to', {
        from: fromDate,
        to: toDate,
      });

    if (studentTerm) {
      const termCondition =
        '(r.studentName LIKE :studentTerm OR r.studentId = :studentExact OR r.studentId LIKE :studentTerm OR r.className LIKE :studentTerm OR t.name LIKE :studentTerm OR t.username LIKE :studentTerm)';
      summaryQuery.andWhere(termCondition, {
        studentTerm: `%${studentTerm}%`,
        studentExact: studentTerm,
      });
    }
    if (q.model) {
      summaryQuery.andWhere('c.model = :model', { model: q.model.trim() });
    }
    if (q.status) {
      summaryQuery.andWhere('c.status = :callStatus', {
        callStatus: q.status.trim(),
      });
    }

    const summaryRaw = await summaryQuery
      .select('COUNT(c.id)', 'totalCalls')
      .addSelect('SUM(c.promptTokens)', 'promptTokens')
      .addSelect('SUM(c.completionTokens)', 'completionTokens')
      .addSelect('SUM(c.totalTokens)', 'totalTokens')
      .addSelect(
        'COUNT(CASE WHEN c.totalTokens IS NULL THEN 1 END)',
        'unknownCalls',
      )
      .getRawOne<{
        totalCalls: string | number;
        promptTokens: string | number;
        completionTokens: string | number;
        totalTokens: string | number;
        unknownCalls: string | number;
      }>();

    const rawRows = await query
      .groupBy('r.id')
      .select('r.id', 'reportId')
      .addSelect('r.teacherId', 'teacherId')
      .addSelect('MAX(t.name)', 'teacherName')
      .addSelect('MAX(t.username)', 'teacherUsername')
      .addSelect('r.studentId', 'studentId')
      .addSelect('r.studentName', 'studentName')
      .addSelect('r.className', 'className')
      .addSelect('r.periodType', 'periodType')
      .addSelect('r.periodStart', 'periodStart')
      .addSelect('r.periodEnd', 'periodEnd')
      .addSelect('r.snapshot', 'snapshot')
      .addSelect('r.aiResponse', 'aiResponse')
      .addSelect('r.createdAt', 'createdAt')
      .addSelect('r.updatedAt', 'updatedAt')
      .addSelect('MAX(c.calledAt)', 'latestCalledAt')
      .addSelect('COUNT(c.id)', 'callsCount')
      .addSelect('SUM(c.promptTokens)', 'promptTokens')
      .addSelect('SUM(c.completionTokens)', 'completionTokens')
      .addSelect('SUM(c.totalTokens)', 'totalTokens')
      .addSelect(
        'COUNT(CASE WHEN c.id IS NOT NULL AND c.totalTokens IS NULL THEN 1 END)',
        'unknownCallsCount',
      )
      .orderBy('MAX(c.calledAt)', 'DESC')
      .addOrderBy('r.createdAt', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .limit(page.pageSize)
      .offset(page.offset)
      .getRawMany<{
        reportId: string;
        teacherId: string;
        teacherName: string | null;
        teacherUsername: string | null;
        studentId: string;
        studentName: string;
        className: string;
        periodType: string;
        periodStart: string | Date;
        periodEnd: string | Date;
        snapshot: string | Record<string, unknown> | null;
        aiResponse: string | Record<string, unknown> | null;
        createdAt: string | Date;
        updatedAt: string | Date;
        latestCalledAt: string | Date | null;
        callsCount: string | number;
        promptTokens: string | number | null;
        completionTokens: string | number | null;
        totalTokens: string | number | null;
        unknownCallsCount: string | number;
      }>();

    const items = rawRows.map((row) => {
      let snapshotObj: Record<string, unknown> | null = null;
      if (typeof row.snapshot === 'string') {
        try {
          snapshotObj = JSON.parse(row.snapshot) as Record<string, unknown>;
        } catch {
          snapshotObj = null;
        }
      } else if (row.snapshot && typeof row.snapshot === 'object') {
        snapshotObj = row.snapshot as Record<string, unknown>;
      }

      let callsCount = Number(row.callsCount || 0);
      let unknownCallsCount = Number(row.unknownCallsCount || 0);
      let promptTokens =
        row.promptTokens !== null && row.promptTokens !== undefined
          ? Number(row.promptTokens)
          : null;
      let completionTokens =
        row.completionTokens !== null && row.completionTokens !== undefined
          ? Number(row.completionTokens)
          : null;
      let totalTokens =
        row.totalTokens !== null && row.totalTokens !== undefined
          ? Number(row.totalTokens)
          : null;
      let latestCalledAt = row.latestCalledAt
        ? row.latestCalledAt instanceof Date
          ? row.latestCalledAt.toISOString()
          : new Date(row.latestCalledAt).toISOString()
        : null;

      // 如果当前无独立调用流水，但已落库 aiResponse，动态回填历史调用用量与状态
      if (callsCount === 0 && row.aiResponse) {
        const histCall = extractCallFromAiResponse(
          row.aiResponse,
          row.createdAt instanceof Date
            ? row.createdAt
            : new Date(row.createdAt),
          row.updatedAt instanceof Date
            ? row.updatedAt
            : new Date(row.updatedAt),
        );
        if (histCall) {
          callsCount = 1;
          promptTokens = histCall.promptTokens;
          completionTokens = histCall.completionTokens;
          totalTokens = histCall.totalTokens;
          if (totalTokens === null) {
            unknownCallsCount = 1;
          }
          latestCalledAt = histCall.calledAt.toISOString();
        }
      }

      const isTemplate = snapshotObj?.generationMode === 'template';
      const isStage =
        snapshotObj?.reportKind === 'stage' ||
        Boolean(snapshotObj?.scheduledTask);

      let trackingStatus: 'tracked' | 'template_no_model' | 'legacy_untracked';
      if (callsCount > 0) {
        trackingStatus = 'tracked';
      } else if (isTemplate) {
        trackingStatus = 'template_no_model';
      } else {
        trackingStatus = 'legacy_untracked';
      }

      const snapshotStudentNo = (
        snapshotObj?.student as { studentNo?: string } | undefined
      )?.studentNo;

      let studentNo: string | null = null;
      if (typeof snapshotStudentNo === 'string' && snapshotStudentNo.trim()) {
        studentNo = snapshotStudentNo.trim();
      } else if (typeof row.studentId === 'string') {
        const segments = row.studentId.split(':');
        const candidate = segments[segments.length - 1];
        if (
          candidate &&
          !candidate.startsWith('teacher-') &&
          !candidate.startsWith('class-') &&
          !candidate.startsWith('deleted')
        ) {
          studentNo = candidate;
        }
      }

      return {
        reportId: row.reportId,
        teacherId: row.teacherId || null,
        teacherName: row.teacherName || null,
        teacherUsername: row.teacherUsername || null,
        studentId: row.studentId,
        studentNo,
        studentName: row.studentName,
        className: row.className,
        reportKind: isStage ? 'stage' : row.periodType,
        periodType: row.periodType,
        periodStart:
          row.periodStart instanceof Date
            ? row.periodStart.toISOString()
            : String(row.periodStart),
        periodEnd:
          row.periodEnd instanceof Date
            ? row.periodEnd.toISOString()
            : String(row.periodEnd),
        latestCalledAt,
        callsCount,
        promptTokens,
        completionTokens,
        totalTokens,
        unknownCallsCount,
        trackingStatus,
      };
    });

    return {
      total,
      page: page.page,
      pageSize: page.pageSize,
      range: {
        start: range.start,
        end: range.end,
      },
      summary: {
        totalReports: total,
        totalCalls: Number(summaryRaw?.totalCalls || 0),
        promptTokens: Number(summaryRaw?.promptTokens || 0),
        completionTokens: Number(summaryRaw?.completionTokens || 0),
        totalTokens: Number(summaryRaw?.totalTokens || 0),
        unknownCalls: Number(summaryRaw?.unknownCalls || 0),
      },
      items,
    };
  }

  /** 查询指定报告在筛选条件下的逐次模型调用明细。 */
  async findReportTokenCalls(
    reportId: string,
    q: AdminQueryDto,
    range: { from: string; to: string; start: string; end: string },
    page: AdminPagination,
  ) {
    const reportRepo =
      this.teachers.manager.getRepository(SemesterReportEntity);
    const callsRepo = this.teachers.manager.getRepository(
      SemesterReportTokenCallEntity,
    );

    const report = await reportRepo.findOne({
      where: { id: reportId },
      select: [
        'id',
        'studentName',
        'status',
        'aiResponse',
        'createdAt',
        'updatedAt',
      ],
    });

    if (!report || report.status === 'deleted') {
      return null;
    }

    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);

    const query = callsRepo
      .createQueryBuilder('c')
      .where('c.reportId = :reportId', { reportId })
      .andWhere('c.calledAt >= :from AND c.calledAt < :to', {
        from: fromDate,
        to: toDate,
      });

    if (q.model) {
      query.andWhere('c.model = :model', { model: q.model.trim() });
    }
    if (q.status) {
      query.andWhere('c.status = :callStatus', {
        callStatus: q.status.trim(),
      });
    }

    const total = await query.getCount();
    const rows = await query
      .orderBy('c.calledAt', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .limit(page.pageSize)
      .offset(page.offset)
      .getMany();

    const items = rows.map((row) => ({
      id: row.id,
      calledAt: row.calledAt ? row.calledAt.toISOString() : null,
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      durationMs:
        row.respondedAt && row.calledAt
          ? Math.max(0, row.respondedAt.getTime() - row.calledAt.getTime())
          : null,
      provider: row.provider,
      model: row.model,
      status: row.status,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      responseId: row.responseId,
    }));

    if (total === 0 && report.aiResponse) {
      const extracted = extractCallFromAiResponse(
        report.aiResponse,
        report.createdAt,
        report.updatedAt,
      );
      if (extracted) {
        return {
          reportId: report.id,
          studentName: report.studentName,
          total: 1,
          page: 1,
          pageSize: page.pageSize,
          range: {
            start: range.start,
            end: range.end,
          },
          items: [
            {
              id: `hist-${report.id}`.slice(0, 64),
              calledAt: extracted.calledAt.toISOString(),
              respondedAt: extracted.respondedAt.toISOString(),
              durationMs: Math.max(
                0,
                extracted.respondedAt.getTime() - extracted.calledAt.getTime(),
              ),
              provider: extracted.provider,
              model: extracted.model,
              status: extracted.status,
              promptTokens: extracted.promptTokens,
              completionTokens: extracted.completionTokens,
              totalTokens: extracted.totalTokens,
              responseId: extracted.responseId,
            },
          ],
        };
      }
    }

    return {
      reportId: report.id,
      studentName: report.studentName,
      total,
      page: page.page,
      pageSize: page.pageSize,
      range: {
        start: range.start,
        end: range.end,
      },
      items,
    };
  }
}
