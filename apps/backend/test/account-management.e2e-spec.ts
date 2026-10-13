import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID, scryptSync } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { SemesterReportWorker } from '../src/semester-reports/semester-report.worker';
import { SemesterReportEntity } from '../src/semester-reports/semester-report.entity';
import { shanghaiDay } from '../src/admin/analytics/range';

/** 使用 CI 的隔离 MySQL；仅清理本套件创建的数据，不重建数据库。 */
describe('main/subaccount integration', () => {
  let app: INestApplication, db: DataSource;
  const suffix = randomUUID().slice(0, 8),
    password = 'test-secret123';
  const adminId = `account-admin-${suffix}`;
  let owner: { id: string; token: string },
    foreign: { id: string; token: string },
    child: { id: string; token: string },
    termId: string,
    subjectId: string,
    reportId: string,
    adminCookie: string[];
  const createdIds: string[] = [];
  const base = '/account-management/subaccounts';
  const auth = (
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    token: string,
  ) => {
    const client = request(app.getHttpServer());
    return client[method](path).set('Authorization', `Bearer ${token}`);
  };
  async function createChild(name: string, code: string) {
    const result = await auth('post', base, owner.token).send({
      displayName: name,
      account: `${code}-${suffix}`,
      password,
    });
    if (result.status === 201) createdIds.push(result.body.id);
    return result;
  }
  async function login(code: string, pwd = password) {
    return request(app.getHttpServer())
      .post('/auth/teacher/login')
      .send({ username: `${code}-${suffix}`, password: pwd });
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SemesterReportWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    db = app.get(DataSource);
    await app.init();
    for (const code of ['owner', 'foreign']) {
      const result = await request(app.getHttpServer())
        .post('/auth/teacher/register')
        .send({
          username: `${code}-${suffix}`,
          password,
          parentAccountId: 'forged',
          accountType: 'sub',
        })
        .expect(201);
      expect(result.body.accountType).toBe('main');
      createdIds.push(result.body.id);
      if (code === 'owner') owner = result.body;
      else foreign = result.body;
    }
    const result = await createChild('李老师', 'child');
    expect(result.status).toBe(201);
    child = { id: result.body.id, token: (await login('child')).body.token };
    await db.query(
      'INSERT INTO admin_accounts (id, username, password_hash, salt) VALUES (?, ?, ?, ?)',
      [
        adminId,
        adminId,
        scryptSync(password, 'test-salt', 64).toString('hex'),
        'test-salt',
      ],
    );
    const admin = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .set('X-Admin-Request', '1')
      .send({ username: adminId, password })
      .expect(201);
    adminCookie = admin.headers['set-cookie'] as unknown as string[];
  });
  afterAll(async () => {
    if (db && createdIds.length) {
      for (const table of [
        'semester_report_shares',
        'semester_report_events',
        'semester_reports',
        'semester_report_subjects',
        'semester_report_terms',
        'analytics_events',
        'account_management_audit',
        'sticky_notes_notes',
        'pet_points_state_history',
        'pet_points_students',
        'pet_points_rubrics',
        'pet_points_rewards',
        'pet_points_settings',
        'countdown_states',
        'student_students',
        'student_groups',
        'student_classrooms',
        'teacher_auth_sessions',
      ]) {
        const column =
          table === 'account_management_audit'
            ? 'owner_account_id'
            : 'teacher_id';
        await db.query(
          `DELETE FROM ${table} WHERE ${column} IN (${createdIds.map(() => '?').join(',')})`,
          createdIds,
        );
      }
      await db.query(
        `DELETE FROM teacher_auth_teachers WHERE id IN (${createdIds.map(() => '?').join(',')})`,
        createdIds,
      );
      await db.query('DELETE FROM admin_accounts WHERE id = ?', [adminId]);
    }
    await app?.close();
  });
  it('shares owner data across all tool reads, with actor identity intact and foreign data isolated', async () => {
    const me = await auth('get', '/auth/teacher/me', child.token).expect(200);
    expect(me.body).toMatchObject({
      id: child.id,
      ownerAccountId: owner.id,
      capabilities: { accountManagement: false, reportConfiguration: false },
    });
    const note = await auth('post', '/sticky-notes', child.token)
      .send({ title: '共享便签', content: '测试' })
      .expect(201);
    const ownNotes = await auth('get', '/sticky-notes', owner.token).expect(
      200,
    );
    expect(
      ownNotes.body.some((row: { id: string }) => row.id === note.body.id),
    ).toBe(true);
    await auth('patch', `/sticky-notes/${note.body.id}`, foreign.token)
      .send({ title: '越权' })
      .expect(404);
    await auth('get', base, child.token).expect(403);
    await auth('post', base, child.token)
      .send({ displayName: '伪造', account: 'forged', password })
      .expect(403);
    await auth('delete', `${base}/${child.id}`, foreign.token).expect(404);
    for (const path of [
      '/classes',
      '/countdown',
      '/random-picker/classes',
      '/task-stats',
      '/pet-points',
      '/gacha-machine',
      '/seating-charts',
    ]) {
      const response = await auth('get', path, child.token);
      expect(response.status).toBe(200);
    }
    const [event] = await db.query(
      "SELECT teacher_id, owner_account_id FROM analytics_events WHERE teacher_id = ? AND action = 'create' AND feature = 'sticky-notes'",
      [child.id],
    );
    expect(event).toMatchObject({
      teacher_id: child.id,
      owner_account_id: owner.id,
    });
  });
  it('prevents report setup writes while allowing report creation and editing with immutable actor history', async () => {
    const term = await auth(
      'post',
      '/semester-reports/report-terms',
      owner.token,
    )
      .send({
        name: '测试学期',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      })
      .expect(201);
    termId = term.body.id;
    const subject = await auth(
      'post',
      '/semester-reports/report-subjects',
      owner.token,
    )
      .send({ name: '数学' })
      .expect(201);
    subjectId = subject.body.id;
    await auth('post', '/semester-reports/report-terms', child.token)
      .send({ name: '禁止创建' })
      .expect(403);
    await auth('post', '/semester-reports/report-subjects', child.token)
      .send({ name: '禁止创建' })
      .expect(403);
    await auth(
      'patch',
      `/semester-reports/report-subjects/${subjectId}/performance-config`,
      child.token,
    )
      .send({ performanceConfig: [] })
      .expect(403);
    const subjects = await auth(
      'get',
      '/semester-reports/report-subjects',
      child.token,
    ).expect(200);
    expect(
      subjects.body.some((row: { id: string }) => row.id === subjectId),
    ).toBe(true);
    const classroom = await auth('post', '/classes', child.token)
      .send({ name: '报告测试班' })
      .expect(201);
    const student = await auth(
      'post',
      `/classes/${classroom.body.id}/students`,
      child.token,
    )
      .send({ name: '脱敏学生' })
      .expect(201);
    await auth('post', '/pet-points/students/sync', child.token)
      .send({
        classId: classroom.body.id,
        className: '报告测试班',
        students: [
          { id: student.body.id, name: '脱敏学生', studentNo: 'fixture-1' },
        ],
      })
      .expect(201);
    const generated = await auth(
      'post',
      '/semester-reports/reports/generate',
      child.token,
    )
      .set('x-report-version', 'v2')
      .send({
        termId,
        subjectId,
        reportVersion: 'v2',
        period: 'month',
        start: shanghaiDay(),
        end: shanghaiDay(),
        studentIds: [student.body.id],
        courseSelections: [{ subjectId, courseScope: '', manualContent: '' }],
      })
      .expect(201);
    expect(generated.body.reports).toHaveLength(1);
    const task = await db
      .getRepository(SemesterReportEntity)
      .findOneByOrFail({ id: generated.body.reports[0].id });
    expect(task.teacherId).toBe(owner.id);
    expect(task.snapshot?.initiatedBy).toMatchObject({
      id: child.id,
      name: '李老师',
    });
    // Seed a completed draft with valid content so API editing does not depend on external AI/PDF or worker timing.
    const repo = db.getRepository(SemesterReportEntity);
    reportId = randomUUID();
    const content = {
      summary: '原寄语',
      courseOverview: '',
      strengths: [],
      areasToImprove: [],
      homeSuggestions: [],
      limitations: [],
      classroomPerformance: [],
    };
    await repo.save(
      repo.create({
        id: reportId,
        teacherId: owner.id,
        termId,
        subjectId,
        studentId: 'fixture',
        studentName: '脱敏学生',
        className: '测试班',
        periodType: 'term',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-06-01'),
        status: 'draft',
        content,
        snapshot: {
          reportVersion: 'v2',
          allowedReferences: ['teacher-review'],
          reportSubjects: [{ subjectId, name: '数学' }],
        },
      }),
    );
    const opened = await auth(
      'get',
      `/semester-reports/reports/${reportId}`,
      child.token,
    ).expect(200);
    await auth(
      'patch',
      `/semester-reports/reports/${reportId}/draft`,
      child.token,
    )
      .send({ content })
      .expect(400);
    await auth(
      'patch',
      `/semester-reports/reports/${reportId}/draft`,
      child.token,
    )
      .set('x-report-version', 'v2')
      .send({
        content: {
          ...content,
          summary: '子账号编辑',
          classroomPerformance: [
            {
              subjectId,
              text: '课堂参与：主动',
              sourceRefs: ['teacher-review'],
            },
          ],
        },
        expectedVersion: opened.body.currentVersion,
      })
      .expect(200);
    await auth(
      'patch',
      `/semester-reports/reports/${reportId}/draft`,
      owner.token,
    )
      .send({ content, expectedVersion: opened.body.currentVersion })
      .expect(409);
    await auth('patch', `${base}/${child.id}`, owner.token)
      .send({ displayName: '改名后' })
      .expect(200);
    const history = await auth(
      'get',
      `/semester-reports/reports/${reportId}/events`,
      owner.token,
    ).expect(200);
    expect(
      history.body.find(
        (row: { action: string }) => row.action === 'draft-edited',
      ).actor,
    ).toMatchObject({ id: child.id, name: '李老师', type: 'sub' });
    await auth(
      'get',
      `/semester-reports/reports/${reportId}`,
      foreign.token,
    ).expect(404);
  });
  it('shows subaccounts and their actual usage in main and independent Admin views', async () => {
    const usage = await auth(
      'get',
      `${base}/${child.id}/usage?start=${shanghaiDay()}&end=${shanghaiDay()}`,
      owner.token,
    ).expect(200);
    expect(usage.body.totals.logins).toBeGreaterThanOrEqual(1);
    expect(usage.body.totals.uses).toBeGreaterThanOrEqual(2);
    expect(usage.body.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reportVersion: 'v2', uses: 2 }),
      ]),
    );
    expect(usage.body.reportActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'draft-edited', count: 1 }),
      ]),
    );
    const activity = await auth(
      'get',
      `${base}/${child.id}/activity`,
      owner.token,
    ).expect(200);
    expect(activity.body.total).toBe(2);
    await auth('get', `${base}/${child.id}/usage`, foreign.token).expect(404);
    await auth(
      'get',
      `${base}/${child.id}/usage?start=2026-02-30`,
      owner.token,
    ).expect(400);
    const detail = await request(app.getHttpServer())
      .get(`/admin/teachers/${child.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body).toMatchObject({
      accountType: 'sub',
      parentAccountId: owner.id,
      ownerAccountId: owner.id,
      status: 'active',
    });
    expect(detail.body.usage.totals.uses).toBeGreaterThanOrEqual(2);
    const team = await auth('get', `${base}/usage-summary`, owner.token).expect(
      200,
    );
    expect(team.body.totals.uses).toBeGreaterThanOrEqual(
      usage.body.totals.uses,
    );
    const teamActivity = await auth(
      'get',
      `${base}/activity-summary`,
      owner.token,
    ).expect(200);
    expect(teamActivity.body.total).toBe(2);
    await auth('get', `${base}/usage-summary`, child.token).expect(403);
    const main = await request(app.getHttpServer())
      .get(`/admin/teachers/${owner.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(
      main.body.subaccounts.some((row: { id: string }) => row.id === child.id),
    ).toBe(true);
    const filtered = await request(app.getHttpServer())
      .get(
        `/admin/teachers?accountType=sub&ownerAccountId=${owner.id}&status=active`,
      )
      .set('Cookie', adminCookie)
      .expect(200);
    expect(filtered.body.items).toHaveLength(1);
  });
  it('revokes old sessions on lock and reset, does not revive them on unlock, and retains report data on deletion', async () => {
    await auth('patch', `${base}/${child.id}/status`, owner.token)
      .send({ status: 'locked' })
      .expect(200);
    await auth('get', '/auth/teacher/me', child.token).expect(401);
    expect((await login('child')).status).toBe(401);
    await auth('patch', `${base}/${child.id}/status`, owner.token)
      .send({ status: 'active' })
      .expect(200);
    await auth('get', '/auth/teacher/me', child.token).expect(401);
    child.token = (await login('child')).body.token;
    await auth('post', `${base}/${child.id}/reset-password`, owner.token)
      .send({ password: 'changed-secret123' })
      .expect(201);
    await auth('get', '/auth/teacher/me', child.token).expect(401);
    expect((await login('child')).status).toBe(401);
    child.token = (await login('child', 'changed-secret123')).body.token;
    await auth('delete', `${base}/${child.id}`, owner.token).expect(200);
    await auth('delete', `${base}/${child.id}`, owner.token).expect(200);
    await auth('get', '/auth/teacher/me', child.token).expect(401);
    await auth('patch', `${base}/${child.id}/status`, owner.token)
      .send({ status: 'active' })
      .expect(404);
    await auth(
      'get',
      `/semester-reports/reports/${reportId}`,
      owner.token,
    ).expect(200);
    const events = await auth(
      'get',
      `/semester-reports/reports/${reportId}/events`,
      owner.token,
    ).expect(200);
    expect(
      events.body.find(
        (row: { action: string }) => row.action === 'draft-edited',
      ).actor.name,
    ).toBe('李老师');
    expect((await createChild('不能复用', 'child')).status).toBe(409);
    const list = await auth('get', base, owner.token).expect(200);
    expect(list.body.used).toBe(0);
  });
  it('enforces five slots under real concurrent transactions and keeps locked accounts counted', async () => {
    const results = await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        createChild(`并发-${i}`, `concurrent-${i}`),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    const first = results.find((r) => r.status === 201)!.body.id;
    await auth('patch', `${base}/${first}/status`, owner.token)
      .send({ status: 'locked' })
      .expect(200);
    expect((await createChild('第六个', 'sixth')).status).toBe(409);
    await auth('delete', `${base}/${first}`, owner.token).expect(200);
    expect((await createChild('替补', 'replacement')).status).toBe(201);
    expect((await auth('get', base, owner.token).expect(200)).body.used).toBe(
      5,
    );
  });
});
