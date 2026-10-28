import 'reflect-metadata';
import '../src/common/load-env';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, type QueryRunner } from 'typeorm';
import { SemesterReportEntity } from '../src/semester-reports/semester-report.entity';
import { SemesterReportsService } from '../src/semester-reports/semester-reports.service';
import { SemesterReportsController } from '../src/semester-reports/semester-reports.controller';

// 显式开启；只在专属连接创建临时表，既不迁移也不读写现有报告和分享数据。
const suite =
  process.env.REPORT_LIST_MYSQL_TEST === '1' ? describe : describe.skip;
suite('report list MySQL large snapshots', () => {
  let source: DataSource;
  let runner: QueryRunner;
  let service: SemesterReportsService;
  let sortBuffer: number;
  let app: INestApplication;
  beforeAll(async () => {
    source = new DataSource({
      type: 'mysql',
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      username: process.env.MYSQL_USER ?? 'root',
      password: process.env.MYSQL_PASSWORD ?? '',
      database: process.env.MYSQL_DATABASE ?? 'classroom_toolkit',
      entities: [SemesterReportEntity],
      synchronize: false,
      migrationsRun: false,
      charset: 'utf8mb4',
    });
    await source.initialize();
    runner = source.createQueryRunner();
    await runner.connect();
    const [settings] = await runner.query(
      'SELECT @@SESSION.sort_buffer_size AS size',
    );
    sortBuffer = Number(settings.size);
    await runner.query('SET SESSION sort_buffer_size = 32768');
    // 临时表仅遮蔽这条连接中的同名表，关闭连接后自动消失；不使用 DROP TABLE。
    await runner.query(`CREATE TEMPORARY TABLE semester_reports (
      id VARCHAR(64) PRIMARY KEY, teacher_id VARCHAR(64), term_id VARCHAR(64), subject_id VARCHAR(64),
      student_id VARCHAR(64), student_name VARCHAR(100), class_name VARCHAR(100), period_type VARCHAR(16),
      period_start DATETIME, period_end DATETIME, score_scope VARCHAR(16), snapshot JSON, content JSON,
      status VARCHAR(24), keywords TEXT, teacher_observation TEXT, course_scope TEXT, error_message VARCHAR(500),
      created_at DATETIME, updated_at DATETIME, published_at DATETIME
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const padding = 'x'.repeat(128 * 1024);
    for (let index = 0; index < 216; index++) {
      await runner.query(
        `INSERT INTO semester_reports
        (id, teacher_id, student_id, student_name, class_name, period_type, snapshot, status, period_start, period_end, created_at, updated_at)
        VALUES (?, ?, ?, ?, '测试班', ?, ?, ?, ?, ?, ?, ?)`,
        [
          `report-${index}`,
          index === 215 ? 'other' : 'teacher',
          `student-${index}`,
          `学生_${index}%`,
          index % 3 === 0 ? 'week' : 'month',
          JSON.stringify({
            ...(index < 213 || index === 215 ? { reportVersion: 'v2' } : {}),
            subjectName: '阅读',
            classroomPhoto: padding,
          }),
          index === 214 ? 'deleted' : index % 2 === 0 ? 'draft' : 'published',
          new Date(
            index === 1
              ? '2026-10-04T16:00:00Z'
              : index === 2
                ? '2026-10-18T16:00:00Z'
                : index === 3
                  ? '2026-10-18T15:59:59Z'
                  : '2026-10-11T16:00:00Z',
          ),
          new Date(
            index === 1
              ? '2026-10-11T16:00:00Z'
              : index === 2
                ? '2026-10-25T16:00:00Z'
                : '2026-10-18T16:00:00Z',
          ),
          new Date(Date.UTC(2026, 9, 1, 0, index)),
          new Date(Date.UTC(2026, 9, 1, 0, index)),
        ],
      );
    }
    service = new SemesterReportsService(
      ...([
        {},
        {},
        {},
        runner.manager.getRepository(SemesterReportEntity),
        { findOne: jest.fn().mockResolvedValue(null) },
        {},
        {},
        {},
        { teacherId: 'teacher' },
        {},
      ] as unknown as ConstructorParameters<typeof SemesterReportsService>),
    );
    const module = await Test.createTestingModule({
      controllers: [SemesterReportsController],
      providers: [{ provide: SemesterReportsService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
    if (runner?.isReleased === false) {
      await runner.query('DROP TEMPORARY TABLE IF EXISTS semester_reports');
      if (sortBuffer)
        await runner.query(`SET SESSION sort_buffer_size = ${sortBuffer}`);
      await runner.release();
    }
    if (source?.isInitialized) await source.destroy();
  });

  it('lists v2 photos without sort memory errors and paginates only matching owned reports', async () => {
    const first = await service.listReports({
      q: '',
      status: '',
      period: '',
      version: 'v2',
      page: '1',
    });
    const next = await service.listReports({ version: 'v2', page: '2' });
    expect(first).toHaveLength(200);
    expect(next).toHaveLength(13);
    expect(first[0].id).toBe('report-212');
    expect(next.at(-1)?.id).toBe('report-0');
    expect(new Set([...first, ...next].map((row) => row.id)).size).toBe(213);
    expect(
      first.every((row) => row.content === null && !('snapshot' in row)),
    ).toBe(true);
  });
  it('keeps literal search, state, period and legacy version filters with large snapshots', async () => {
    expect(
      (await service.listReports({ q: '学生_1%', version: 'v2' })).map(
        (row) => row.id,
      ),
    ).toEqual(['report-1']);
    expect(await service.listReports({ q: '其他学生', version: 'v2' })).toEqual(
      [],
    );
    const rows = await service.listReports({
      q: '阅读',
      status: 'draft',
      period: 'week',
      version: 'v2',
    });
    expect(rows).toHaveLength(36);
    expect(
      rows.every((row) => row.status === 'draft' && row.period === 'week'),
    ).toBe(true);
    expect(
      (await service.listReports({ version: 'v1' })).map((row) => row.id),
    ).toEqual(['report-213']);
  });
  it('returns HTTP 200 for the reported empty-filter v2 request and rejects invalid filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/semester-reports/reports?q=&status=&period=&version=v2&page=1')
      .expect(200);
    expect(response.body).toHaveLength(200);
    expect(response.body[0].id).toBe('report-212');
    expect(
      response.body.every(
        (row) => row.reportVersion === 'v2' && row.content === null,
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .get('/semester-reports/reports?version=v3')
      .expect(400);
  });
  it('filters inclusive Shanghai report days before pagination, including midnight and open-ended ranges', async () => {
    const filters = {
      version: 'v2',
      startDate: '2026-10-18',
      endDate: '2026-10-18',
    };
    const first = await service.listReports(filters);
    const second = await service.listReports({ ...filters, page: '2' });
    expect(first).toHaveLength(200);
    expect(second).toHaveLength(11);
    const ids = [...first, ...second].map((row) => row.id);
    expect(ids).toContain('report-3');
    expect(ids).not.toContain('report-1');
    expect(ids).not.toContain('report-2');
    expect(
      (await service.listReports({ startDate: '2026-10-19' })).map(
        (row) => row.id,
      ),
    ).toEqual(['report-2']);
    expect(
      (await service.listReports({ endDate: '2026-10-11' })).map(
        (row) => row.id,
      ),
    ).toEqual(['report-1']);
    const response = await request(app.getHttpServer())
      .get('/semester-reports/reports')
      .query({ ...filters, q: '学生_0%', status: 'draft', period: 'week' })
      .expect(200);
    expect(response.body.map((row) => row.id)).toEqual(['report-0']);
    await request(app.getHttpServer())
      .get('/semester-reports/reports')
      .query({ startDate: '2026-02-30' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/semester-reports/reports')
      .query({ startDate: '2026-10-19', endDate: '2026-10-18' })
      .expect(400);
  });
});
