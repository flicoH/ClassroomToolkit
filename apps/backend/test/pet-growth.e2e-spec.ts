import { PetGrowthCycles20261014000000 } from '../src/database/migrations/20261014000000-pet-growth-cycles';
import { PetCompletedEntity } from '../src/pet-points/entities/pet-completed.entity';
import { PetOperationEntity } from '../src/pet-points/entities/pet-operation.entity';
import { PetStateHistoryEntity } from '../src/pet-points/entities/pet-state-history.entity';
import { ClassroomEntity } from '../src/students/entities/classroom.entity';
import { StudentEntity } from '../src/students/entities/student.entity';
import { StudentGroupEntity } from '../src/students/entities/student-group.entity';
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { migrationFiles } from '../src/database/migration-files';
import { PetPointsDatabase } from '../src/pet-points/pet-points.database';
import { PetPointsService } from '../src/pet-points/pet-points.service';
import { PetStudentEntity } from '../src/pet-points/entities/pet-student.entity';
import { PetRubricEntity } from '../src/pet-points/entities/pet-rubric.entity';
import { PetRewardEntity } from '../src/pet-points/entities/pet-reward.entity';
import { PetEvaluationRecordEntity } from '../src/pet-points/entities/pet-evaluation-record.entity';
import { PetRedemptionEntity } from '../src/pet-points/entities/pet-redemption.entity';
import { PetSettingEntity } from '../src/pet-points/entities/pet-setting.entity';
import type { TeacherContext } from '../src/auth/teacher-context';

// Explicit opt-in prevents the integration suite from touching a developer database.
const database = process.env.PET_TEST_DATABASE;
const suite = database ? describe : describe.skip;
suite('pet growth isolated MySQL migration and transactions', () => {
  let source: DataSource;
  let service: PetPointsService;
  let other: PetPointsService;
  const options = {
    host: '127.0.0.1',
    port: Number(process.env.PET_TEST_PORT ?? 33316),
    user: 'root',
    password: process.env.PET_TEST_PASSWORD ?? '',
  };
  function make(teacherId: string) {
    return new PetPointsService(
      new PetPointsDatabase(
        source.getRepository(PetStudentEntity),
        source.getRepository(PetRubricEntity),
        source.getRepository(PetRewardEntity),
        source.getRepository(PetEvaluationRecordEntity),
        source.getRepository(PetRedemptionEntity),
        source.getRepository(PetSettingEntity),
        { teacherId } as TeacherContext,
      ),
    );
  }
  let n = 0;
  async function meta() {
    return {
      operationId: `mysql-operation-${++n}`,
      revisions: Object.fromEntries(
        (await service.overview()).students.map((s) => [s.id, s.revision]),
      ),
    };
  }
  beforeAll(async () => {
    if (
      !database ||
      !/^pet_test_[a-z0-9_]+$/.test(database) ||
      options.port === 3306
    )
      throw new Error(
        'Only a dedicated pet_test_ database on a separate port is allowed',
      );
    const connection = await createConnection({
      ...options,
      multipleStatements: true,
    });
    await connection.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`,
    );
    await connection.query(`USE \`${database}\``);
    const schema = readFileSync(
      join(__dirname, '../database/schema.sql'),
      'utf8',
    )
      .replace(/CREATE DATABASE[^;]+;/gi, '')
      .replace(/USE classroom_toolkit;/gi, '');
    await connection.query(schema);
    await connection.query(
      "INSERT INTO pet_points_settings(teacher_id,max_level,final_energy) VALUES ('teacher',10,200)",
    );
    await connection.query(
      "INSERT INTO pet_points_students(teacher_id,id,name,student_no,class_id,class_name,group_name,score,level_num,stage,pet_id,pet_progress,trophies,completed_pets) VALUES ('teacher','teacher:one','测试甲','1','class','测试班','一组',44,2,'第2形态','sprout-puff',10,7,2),('teacher','teacher:two','测试乙','2','class','测试班','一组',200,10,'终极形态','cloud-bear',100,8,0)",
    );
    await connection.query(
      "INSERT INTO student_classrooms(teacher_id,id,name) VALUES ('teacher','class','规范测试班')",
    );
    await connection.query(
      "INSERT INTO student_students(teacher_id,id,classroom_id,name,student_no) VALUES ('teacher','one','class','测试甲','1'),('teacher','two','class','测试乙','2')",
    );
    await connection.end();
    source = new DataSource({
      type: 'mysql',
      host: options.host,
      port: options.port,
      username: options.user,
      password: options.password,
      database,
      entities: [
        PetStudentEntity,
        PetRubricEntity,
        PetRewardEntity,
        PetEvaluationRecordEntity,
        PetRedemptionEntity,
        PetSettingEntity,
        PetCompletedEntity,
        PetOperationEntity,
        PetStateHistoryEntity,
        ClassroomEntity,
        StudentEntity,
        StudentGroupEntity,
      ],
      migrations: migrationFiles(
        join(__dirname, '../dist/database/migrations'),
        ['js'],
      ),
      synchronize: false,
    });
    await source.initialize();
    // Interrupt after early DDL has committed, then let the real migration loader safely resume it.
    const interrupted = source.createQueryRunner();
    await interrupted.connect();
    const originalQuery = interrupted.query.bind(interrupted);
    const fault = jest
      .spyOn(interrupted, 'query')
      .mockImplementation(
        async (...args: Parameters<typeof interrupted.query>) => {
          if (
            String(args[0]).startsWith(
              'CREATE TABLE IF NOT EXISTS pet_points_operations',
            )
          )
            throw new Error('injected migration interruption');
          return originalQuery(...args);
        },
      );
    await expect(
      new PetGrowthCycles20261014000000().up(interrupted),
    ).rejects.toThrow('migration interruption');
    fault.mockRestore();
    await interrupted.release();
    await source.runMigrations();
    service = make('teacher');
    other = make('other');
  }, 30000);
  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
  });
  it('preserves balance, old grades and counts without inventing snapshots or granting badges', async () => {
    const view = await service.overview();
    const one = view.students.find((s) => s.id === 'one')!;
    expect(one).toMatchObject({
      score: 44,
      petExperience: 43,
      level: 2,
      trophies: 7,
      completedPets: 2,
    });
    expect(view.completed).toEqual([]);
    const rows = await source.query(
      "SELECT migration_evidence FROM pet_points_students WHERE id='teacher:one'",
    );
    expect(
      typeof rows[0].migration_evidence === 'string'
        ? JSON.parse(rows[0].migration_evidence)
        : rows[0].migration_evidence,
    ).toMatchObject({ score: 44, level: 2, experience: 43 });
  });
  it('ignores empty client rosters and preserves SQL null clearing and completed snapshots across cycles', async () => {
    expect(
      await service.syncClassStudents({ classId: 'class', students: [] }),
    ).toHaveLength(2);
    const dto = await meta();
    const result = await service.completePet('two', dto);
    await service.completePet('two', dto);
    expect(result.student).toMatchObject({
      petId: null,
      petExperience: 0,
      score: 200,
      trophies: 8,
      completedPets: 1,
    });
    const row = (
      await source.query(
        "SELECT pet_id,pet_name FROM pet_points_students WHERE id='teacher:two'",
      )
    )[0];
    expect(row).toEqual({ pet_id: null, pet_name: null });
    await service.bindPet('two', {
      ...(await meta()),
      petId: 'sprout-puff',
      petName: '新轮',
    });
    await service.adjustScore({
      ...(await meta()),
      studentIds: ['two'],
      delta: 44,
      label: '新轮成长',
    });
    expect((await service.overview()).completed).toHaveLength(1);
    expect((await service.overview()).completed[0]!.petId).toBe('cloud-bear');
    expect((await other.overview()).completed).toHaveLength(0);
  });
  it('serializes concurrent completion and rejects overwriting pending pets', async () => {
    await service.adjustScore({
      ...(await meta()),
      studentIds: ['two'],
      delta: 200,
      label: '再满级',
    });
    await expect(
      service.bindPet('two', { ...(await meta()), petId: 'cloud-bear' }),
    ).rejects.toThrow('先完成');
    const beforeFailure = await service.overview();
    await source.query(
      "CREATE TRIGGER pet_test_archive_failure BEFORE INSERT ON pet_points_completed FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected archive failure'",
    );
    await expect(service.completePet('two', await meta())).rejects.toThrow(
      'injected archive failure',
    );
    expect((await service.overview()).students).toEqual(beforeFailure.students);
    await source.query('DROP TRIGGER pet_test_archive_failure');
    const dto = await meta();
    const results = await Promise.allSettled([
      service.completePet('two', dto),
      service.completePet('two', {
        ...dto,
        operationId: 'concurrent-complete',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await service.overview()).completed).toHaveLength(2);
    await expect(
      other.completePet('two', { ...dto, operationId: 'other-completion' }),
    ).rejects.toThrow('不存在');
  });
  it('rolls back student and earlier score records when a later SQL insert fails', async () => {
    const before = await service.overview();
    await source.query(
      "CREATE TRIGGER pet_test_failure BEFORE INSERT ON pet_points_evaluation_records FOR EACH ROW BEGIN IF NEW.label='SQL失败' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected insert failure'; END IF; END",
    );
    const rubric = await service.createRubric({
      ...(await meta()),
      category: '课堂表现',
      label: 'SQL失败',
      score: 10,
    });
    const normal = before.rubrics[0]!;
    await expect(
      service.evaluate(
        {
          ...(await meta()),
          studentIds: ['one', 'two'],
          rubricIds: [normal.id, rubric.id],
        },
        false,
      ),
    ).rejects.toThrow('injected');
    const after = await service.overview();
    expect(after.students).toEqual(before.students);
    expect(after.records).toEqual(before.records);
    await source.query('DROP TRIGGER pet_test_failure');
  });
  it('commits only one purchase of the last stock, without changing experience', async () => {
    const reward = await service.createReward({
      ...(await meta()),
      name: '最后一件',
      cost: 1,
      stock: 1,
    });
    const before = await service.overview();
    await source.query(
      "CREATE TRIGGER pet_test_redemption_failure BEFORE INSERT ON pet_points_redemptions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected redemption failure'",
    );
    await expect(
      service.redeem({
        ...(await meta()),
        studentId: 'one',
        rewardId: reward.id,
      }),
    ).rejects.toThrow('injected redemption failure');
    expect((await service.overview()).students).toEqual(before.students);
    expect(
      (await service.overview()).rewards.find((r) => r.id === reward.id)!.stock,
    ).toBe(1);
    await source.query('DROP TRIGGER pet_test_redemption_failure');
    const dto = await meta();
    const results = await Promise.allSettled([
      service.redeem({ ...dto, studentId: 'one', rewardId: reward.id }),
      service.redeem({
        ...dto,
        operationId: 'parallel-redemption',
        studentId: 'two',
        rewardId: reward.id,
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const after = await service.overview();
    expect(
      after.students.map((s) => [s.id, s.petExperience, s.level]).sort(),
    ).toEqual(
      before.students.map((s) => [s.id, s.petExperience, s.level]).sort(),
    );
    expect(after.rewards.find((r) => r.id === reward.id)!.stock).toBe(0);
    expect(after.redemptions).toHaveLength(1);
  });
  it('maps legacy completion identities on read without rewriting the immutable stored snapshot', async () => {
    const before = (
      await source.query(
        "SELECT snapshot FROM pet_points_completed WHERE student_id='two' LIMIT 1",
      )
    )[0].snapshot;
    await source.query(
      "UPDATE pet_points_students SET logical_id='canonical-two' WHERE id='teacher:two'",
    );
    expect(
      (await service.overview()).completed.some(
        (snapshot) => snapshot.studentId === 'canonical-two',
      ),
    ).toBe(true);
    expect(
      (
        await source.query(
          "SELECT snapshot FROM pet_points_completed WHERE student_id='two' LIMIT 1",
        )
      )[0].snapshot,
    ).toEqual(before);
    await source.query(
      "UPDATE pet_points_students SET logical_id='two' WHERE id='teacher:two'",
    );
  });
  it('keeps distinct long logical student IDs, score records and completed references without truncation collisions', async () => {
    const first = 'long-' + 'a'.repeat(58) + '1',
      second = 'long-' + 'a'.repeat(58) + '2';
    await source.query(
      "INSERT INTO student_classrooms(teacher_id,id,name) VALUES ('teacher','long-class','长学号测试班')",
    );
    for (const [id, name, no] of [
      [first, '长号甲', '202600000001'],
      [second, '长号乙', '202600000002'],
    ])
      await source.query(
        'INSERT INTO student_students(teacher_id,id,classroom_id,name,student_no) VALUES (?,?,?,?,?)',
        ['teacher', id, 'long-class', name, no],
      );
    const legacy = 'long-' + 'a'.repeat(58) + '3';
    const legacyStorage = `teacher:${legacy}`.slice(0, 64);
    await source.query(
      'INSERT INTO student_students(teacher_id,id,classroom_id,name,student_no) VALUES (?,?,?,?,?)',
      ['teacher', legacy, 'long-class', '旧长号丙', '202600000003'],
    );
    await source.query(
      `INSERT INTO pet_points_students(teacher_id,id,logical_id,name,student_no,class_id,class_name,group_name,score,pet_experience,cycle_id,reward_grants,reward_protection)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,JSON_ARRAY(),JSON_ARRAY())`,
      [
        'teacher',
        legacyStorage,
        legacy,
        '旧长号丙',
        '202600000003',
        'long-class',
        '长学号测试班',
        '未分组',
        9,
        9,
        'legacy-long-cycle',
      ],
    );
    const synced = await service.syncClassStudents({ classId: 'long-class' });
    expect(new Set(synced.map((student) => student.id)).size).toBe(3);
    await service.adjustScore({
      ...(await meta()),
      studentIds: [first],
      delta: 22,
      label: '长号加分',
    });
    await service.adjustScore({
      ...(await meta()),
      studentIds: [second],
      delta: 3,
      label: '另一长号',
    });
    const overview = await service.overview();
    expect(overview.students.find((s) => s.id === legacy)).toMatchObject({
      score: 9,
      petExperience: 9,
    });
    expect(
      (
        await source.query(
          'SELECT id,roster_active FROM pet_points_students WHERE logical_id=?',
          [legacy],
        )
      )[0],
    ).toMatchObject({ id: legacyStorage, roster_active: 1 });
    expect(overview.students.find((s) => s.id === first)!.score).toBe(22);
    expect(overview.students.find((s) => s.id === second)!.score).toBe(3);
    expect(overview.records.filter((r) => r.studentId === first)).toHaveLength(
      1,
    );
    expect(overview.records.filter((r) => r.studentId === second)).toHaveLength(
      1,
    );
    await service.redeem({
      ...(await meta()),
      studentId: first,
      rewardId: overview.rewards.find(
        (reward) => reward.enabled && reward.stock > 0 && reward.cost <= 22,
      )!.id,
    });
    expect(
      (await service.overview()).redemptions.some((r) => r.studentId === first),
    ).toBe(true);
    await service.bindPet(first, { ...(await meta()), petId: 'sprout-puff' });
    await service.adjustScore({
      ...(await meta()),
      studentIds: [first],
      delta: 200,
      label: '长号满级',
    });
    await service.completePet(first, await meta());
    expect(
      (await service.overview()).completed.some(
        (snapshot) => snapshot.studentId === first,
      ),
    ).toBe(true);
  });
  it('can be rerun after completion without changing any current cycle or historical snapshot', async () => {
    const before = await service.overview();
    const runner = source.createQueryRunner();
    await runner.connect();
    try {
      await new PetGrowthCycles20261014000000().up(runner);
    } finally {
      await runner.release();
    }
    expect(await service.overview()).toEqual(before);
  });
  it('enforces unique completed cycles in SQL and retains records when roster members leave', async () => {
    const completed = (
      await source.query('SELECT * FROM pet_points_completed LIMIT 1')
    )[0];
    await expect(
      source.query(
        'INSERT INTO pet_points_completed(id,teacher_id,student_id,cycle_id,snapshot) VALUES (?,?,?,?,?)',
        [
          'duplicate',
          completed.teacher_id,
          completed.student_id,
          completed.cycle_id,
          typeof completed.snapshot === 'string'
            ? completed.snapshot
            : JSON.stringify(completed.snapshot),
        ],
      ),
    ).rejects.toThrow();
    const count = (
      await source.query(
        "SELECT COUNT(*) n FROM pet_points_evaluation_records WHERE student_id='teacher:two'",
      )
    )[0].n;
    await source.query("DELETE FROM student_students WHERE id='two'");
    await service.syncClassStudents({ classId: 'class' });
    expect(
      (await service.overview()).students.filter((s) => s.classId === 'class'),
    ).toHaveLength(1);
    expect(
      (
        await source.query(
          "SELECT COUNT(*) n FROM pet_points_evaluation_records WHERE student_id='teacher:two'",
        )
      )[0].n,
    ).toBe(count);
  });
});
