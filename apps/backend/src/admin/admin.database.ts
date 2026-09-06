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
  ) {}

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
}
