import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID, scryptSync } from 'node:crypto';
import { AppModule } from '../src/app.module';

describe('Admin and analytics integration (migrated MySQL)', () => {
  let app: INestApplication,
    db: DataSource,
    cookie: string[],
    teacherId: string,
    teacherToken: string;
  const suffix = randomUUID().slice(0, 8),
    adminId = `test-admin-${suffix}`;
  const username = `test-teacher-${suffix}`,
    password = 'test-password-very-long';
  const extraTeacher = `test-extra-${suffix}`;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    db = app.get(DataSource);
    await db.query(
      'INSERT INTO admin_accounts (id, username, password_hash, salt) VALUES (?, ?, ?, ?)',
      [
        adminId,
        adminId,
        scryptSync(password, 'test-salt', 64).toString('hex'),
        'test-salt',
      ],
    );
    await app.init();
    const login = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .set('X-Admin-Request', '1')
      .send({ username: adminId, password })
      .expect(201);
    cookie = login.headers['set-cookie'] as unknown as string[];
    const teacher = await request(app.getHttpServer())
      .post('/auth/teacher/register')
      .send({ username, password, name: '统计测试教师' })
      .expect(201);
    teacherId = teacher.body.id;
    teacherToken = teacher.body.token;
  });
  afterAll(async () => {
    if (db) {
      await db.query(
        'DELETE FROM analytics_events WHERE teacher_id IN (?, ?)',
        [teacherId, extraTeacher],
      );
      await db.query('DELETE FROM sticky_notes_notes WHERE teacher_id = ?', [
        teacherId,
      ]);
      await db.query('DELETE FROM student_classrooms WHERE teacher_id = ?', [
        teacherId,
      ]);
      await db.query('DELETE FROM teacher_auth_sessions WHERE teacher_id = ?', [
        teacherId,
      ]);
      await db.query('DELETE FROM teacher_auth_teachers WHERE id = ?', [
        teacherId,
      ]);
      await db.query('DELETE FROM admin_accounts WHERE id = ?', [adminId]);
    }
    await app?.close();
  });
  function get(path: string) {
    return request(app.getHttpServer()).get(path).set('Cookie', cookie);
  }
  function adminPost(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookie)
      .set('X-Admin-Request', '1');
  }
  it('isolates admin access from teacher tokens and protects writes against CSRF', async () => {
    await request(app.getHttpServer())
      .get('/admin/dashboard/overview')
      .expect(401);
    await request(app.getHttpServer())
      .get('/admin/dashboard/overview')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/admin/auth/logout')
      .set('Cookie', cookie)
      .send({})
      .expect(403);
    const me = await get('/admin/auth/me').expect(200);
    expect(me.body).toEqual({ id: adminId, username: adminId });
    expect(cookie[0]).toContain('HttpOnly');
    expect(cookie[0]).toContain('SameSite=Strict');
    await request(app.getHttpServer())
      .get('/classes')
      .set('Cookie', cookie)
      .expect(401);
  });
  it('separates registration auto-login, explicit login, failures, and session checks', async () => {
    const [before] = await db.query(
      "SELECT SUM(kind = 'auto_login') AS autoCount, SUM(kind = 'login') AS loginCount FROM analytics_events WHERE teacher_id = ?",
      [teacherId],
    );
    expect(Number(before.autoCount)).toBe(1);
    expect(Number(before.loginCount)).toBe(0);
    await request(app.getHttpServer())
      .post('/auth/teacher/login')
      .send({ username, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/teacher/login')
      .send({ username, password: 'incorrect' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/auth/teacher/me')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    const [after] = await db.query(
      "SELECT SUM(kind = 'login') AS logins, SUM(kind = 'login_failed') AS failures FROM analytics_events WHERE teacher_id = ?",
      [teacherId],
    );
    expect(Number(after.logins)).toBe(1);
    expect(Number(after.failures)).toBe(1);
  });
  it('deduplicates successful business events and rejects spoofed use events', async () => {
    const event = randomUUID();
    for (let i = 0; i < 2; i++)
      await request(app.getHttpServer())
        .post('/sticky-notes')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('x-analytics-event-id', event)
        .send({ title: '测试', content: '', color: 'yellow' })
        .expect(201);
    const [row] = await db.query(
      "SELECT COUNT(*) AS count FROM analytics_events WHERE teacher_id = ? AND kind = 'use' AND feature = 'sticky-notes'",
      [teacherId],
    );
    expect(Number(row.count)).toBe(1);
    await request(app.getHttpServer())
      .post('/analytics/events')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ feature: 'students', kind: 'use', eventId: randomUUID() })
      .expect(400);
    const openId = randomUUID();
    for (let i = 0; i < 2; i++)
      await request(app.getHttpServer())
        .post('/analytics/events')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          feature: 'students',
          kind: 'open',
          eventId: openId,
          teacherId: 'spoofed',
        })
        .expect(201);
    const [opens] = await db.query(
      "SELECT COUNT(*) AS count FROM analytics_events WHERE teacher_id = ? AND kind = 'open'",
      [teacherId],
    );
    expect(Number(opens.count)).toBe(1);
  });
  it('counts distinct teachers over the whole period and honors Shanghai day boundaries', async () => {
    for (const [teacher, kind, stamp] of [
      [teacherId, 'login', '2025-01-01 16:00:00'],
      [teacherId, 'login', '2025-01-02 16:00:00'],
      [extraTeacher, 'login', '2025-01-02 17:00:00'],
      [extraTeacher, 'login', '2025-01-03 16:00:00'],
      [teacherId, 'use', '2025-01-01 16:00:00'],
      [teacherId, 'use', '2025-01-02 16:00:00'],
      [extraTeacher, 'use', '2025-01-02 17:00:00'],
    ])
      await db.query(
        'INSERT INTO analytics_events (id,teacher_id,kind,feature,action,dedupe_key,created_at) VALUES (?,?,?,?,?,?,?)',
        [randomUUID(), teacher, kind, 'students', 'test', randomUUID(), stamp],
      );
    const res = await get(
      '/admin/analytics/logins?start=2025-01-02&end=2025-01-03',
    ).expect(200);
    expect(res.body.totals.logins).toBe(3);
    expect(res.body.totals.teachers).toBe(2);
    const ranking = await get(
      '/admin/analytics/features/ranking?start=2025-01-02&end=2025-01-03',
    ).expect(200);
    const students = ranking.body.items.find((x) => x.key === 'students');
    expect(students.teachers).toBe(2);
    expect(students.uses).toBe(3);
    expect(students.usageRate).toBe(1);
    const boundary = await get(
      '/admin/analytics/login-records?start=2025-01-02&end=2025-01-03',
    ).expect(200);
    expect(boundary.body.total).toBe(3);
  });
  it('serves all directory and reporting queries with safe fields and bounded pagination', async () => {
    for (const path of [
      'dashboard/overview',
      'analytics/registrations',
      'analytics/features/students/trend',
      'students',
      'classrooms',
    ])
      await get(`/admin/${path}`).expect(200);
    const result = await get(`/admin/teachers?search=${username}`).expect(200);
    expect(result.body.total).toBe(1);
    expect(result.body.items[0].passwordHash).toBeUndefined();
    expect(result.body.items[0].password_hash).toBeUndefined();
    await get(`/admin/teachers/${teacherId}`).expect(200);
    await get('/admin/students?teacherSearch=测试&classroomSearch=一班').expect(
      200,
    );
    await get('/admin/teachers?pageSize=100000').expect(400);
    await get('/admin/students?search=a&search=b').expect(400);
    await get('/admin/analytics/logins?start=2025-02-30&end=2025-03-01').expect(
      400,
    );
    await get('/admin/analytics/features/unknown/trend').expect(400);
  });

  it('resets a teacher password through the admin API and revokes existing teacher sessions', async () => {
    await request(app.getHttpServer())
      .post(`/admin/teachers/${teacherId}/reset-password`)
      .set('Cookie', cookie)
      .send({ password: 'new-password-123' })
      .expect(403);
    await adminPost(`/admin/teachers/${teacherId}/reset-password`)
      .send({ password: 'short' })
      .expect(400);
    await adminPost(`/admin/teachers/missing-${suffix}/reset-password`)
      .send({ password: 'new-password-123' })
      .expect(404);
    await adminPost(`/admin/teachers/${teacherId}/reset-password`)
      .send({ password: 'new-password-123' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/auth/teacher/me')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/teacher/login')
      .send({ username, password })
      .expect(401);
    const login = await request(app.getHttpServer())
      .post('/auth/teacher/login')
      .send({ username, password: 'new-password-123' })
      .expect(201);
    teacherToken = login.body.token;
  });

  it('keeps directory totals and ownership filters correct with multiple students', async () => {
    const classroom = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: '统计测试班级' })
      .expect(201);
    for (const studentNo of ['01', '02']) {
      await request(app.getHttpServer())
        .post(`/classes/${classroom.body.id}/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: `学生${studentNo}`, studentNo, gender: '男' })
        .expect(201);
    }
    const teacher = await get(`/admin/teachers?search=${username}`).expect(200);
    expect(teacher.body.total).toBe(1);
    expect(Number(teacher.body.items[0].classrooms)).toBe(1);
    expect(Number(teacher.body.items[0].students)).toBe(2);
    const classes = await get(
      `/admin/classrooms?teacherId=${teacherId}`,
    ).expect(200);
    expect(classes.body.total).toBe(1);
    expect(Number(classes.body.items[0].students)).toBe(2);
    const students = await get(
      `/admin/students?teacherId=${teacherId}&classroomId=${classroom.body.id}&pageSize=1`,
    ).expect(200);
    expect(students.body.total).toBe(2);
    expect(students.body.items).toHaveLength(1);
    expect(students.body.items[0].classroomName).toBe('统计测试班级');
    const unrelated = await get(
      `/admin/students?teacherId=missing&classroomId=${classroom.body.id}`,
    ).expect(200);
    expect(unrelated.body.total).toBe(0);
  });

  it('keeps logout invalidation separate from persistent login history', async () => {
    await request(app.getHttpServer())
      .post('/admin/auth/logout')
      .set('Cookie', cookie)
      .set('X-Admin-Request', '1')
      .send({})
      .expect(201);
    await get('/admin/auth/me').expect(401);
    const [row] = await db.query(
      "SELECT COUNT(*) AS count FROM analytics_events WHERE teacher_id = ? AND kind = 'login'",
      [teacherId],
    );
    expect(Number(row.count)).toBeGreaterThan(0);
  });
});
