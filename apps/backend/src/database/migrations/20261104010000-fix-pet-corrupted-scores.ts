import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPetCorruptedScores20261104010000 implements MigrationInterface {
  name = 'FixPetCorruptedScores20261104010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasTable('pet_points_students')) ||
      !(await queryRunner.hasTable('pet_points_completed'))
    ) {
      return;
    }

    // 1. 根据 pet_points_completed 修复所有学生的 completed_pets 和 trophies
    const completedRows: Array<{
      id: string;
      teacher_id: string;
      student_id: string;
      snapshot: string | Record<string, unknown>;
    }> = await queryRunner.query(
      'SELECT id, teacher_id, student_id, snapshot FROM pet_points_completed',
    );

    const completedStatsByStudent = new Map<
      string,
      { count: number; badges: number }
    >();

    for (const row of completedRows) {
      const sid = row.student_id;
      const current = completedStatsByStudent.get(sid) ?? {
        count: 0,
        badges: 0,
      };
      current.count += 1;
      let earnedBadges = 1;
      if (row.snapshot) {
        try {
          const parsed =
            typeof row.snapshot === 'string'
              ? JSON.parse(row.snapshot)
              : row.snapshot;
          if (
            typeof parsed?.earnedBadges === 'number' &&
            parsed.earnedBadges > 0
          ) {
            earnedBadges = parsed.earnedBadges;
          }
        } catch {
          // ignore parsing error
        }
      }
      current.badges += earnedBadges;
      completedStatsByStudent.set(sid, current);
    }

    for (const [studentId, stats] of completedStatsByStudent.entries()) {
      await queryRunner.query(
        `UPDATE \`pet_points_students\`
         SET \`completed_pets\` = GREATEST(\`completed_pets\`, ?),
             \`trophies\` = GREATEST(\`trophies\`, ?)
         WHERE \`logical_id\` = ? OR \`id\` = ? OR \`id\` LIKE ?`,
        [stats.count, stats.badges, studentId, studentId, `%:${studentId}`],
      );
    }

    // 2. 检查是否有 score = 0 且存在评定历史（pet_points_evaluation_records）的学生，恢复其积分与进化状态
    if (await queryRunner.hasTable('pet_points_evaluation_records')) {
      const corruptedZeroScoreStudents: Array<{
        id: string;
        logical_id: string | null;
      }> = await queryRunner.query(
        `SELECT DISTINCT s.id, s.logical_id
         FROM pet_points_students s
         INNER JOIN pet_points_evaluation_records e
           ON e.student_id = s.id OR e.student_id = s.logical_id
         WHERE s.score = 0`,
      );

      for (const student of corruptedZeroScoreStudents) {
        const lastEvalRows: Array<{
          id: string;
          score_delta: number;
          after_values: string | Record<string, unknown> | null;
        }> = await queryRunner.query(
          `SELECT id, score_delta, after_values
           FROM pet_points_evaluation_records
           WHERE student_id = ? OR student_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 5`,
          [student.id, student.logical_id ?? student.id],
        );

        let restoredScore: number | undefined;
        let restoredExp: number | undefined;
        let restoredProgress: number | undefined;

        for (const evalRow of lastEvalRows) {
          if (!evalRow.after_values) continue;
          try {
            const parsed =
              typeof evalRow.after_values === 'string'
                ? JSON.parse(evalRow.after_values)
                : evalRow.after_values;
            if (typeof parsed?.score === 'number' && parsed.score > 0) {
              restoredScore = parsed.score;
              if (typeof parsed.experience === 'number') {
                restoredExp = parsed.experience;
              }
              if (typeof parsed.energy === 'number') {
                restoredProgress = parsed.energy;
              }
              break;
            }
          } catch {
            // ignore JSON parse error
          }
        }

        let restoredLevel: number | undefined;
        let restoredStage: string | undefined;
        let restoredPetId: string | undefined;
        let restoredPetName: string | undefined;

        if (await queryRunner.hasTable('pet_points_state_history')) {
          const historyRows: Array<{
            id: string;
            pet: string | Record<string, unknown> | null;
          }> = await queryRunner.query(
            `SELECT id, pet
             FROM pet_points_state_history
             WHERE student_id = ? OR student_id = ?
             ORDER BY recorded_at DESC, id DESC
             LIMIT 10`,
            [student.id, student.logical_id ?? student.id],
          );

          for (const historyRow of historyRows) {
            if (!historyRow.pet) continue;
            try {
              const parsed =
                typeof historyRow.pet === 'string'
                  ? JSON.parse(historyRow.pet)
                  : historyRow.pet;
              if (typeof parsed?.level === 'number' && parsed.level > 1) {
                restoredLevel = parsed.level;
                restoredStage = parsed.stage;
                restoredPetId = parsed.petId;
                restoredPetName = parsed.petName;
                break;
              }
            } catch {
              // ignore JSON parse error
            }
          }
        }

        if (restoredScore !== undefined && restoredScore > 0) {
          await queryRunner.query(
            `UPDATE \`pet_points_students\`
             SET \`score\` = ?,
                 \`pet_experience\` = COALESCE(?, \`pet_experience\`),
                 \`pet_progress\` = COALESCE(?, \`pet_progress\`),
                 \`level_num\` = COALESCE(?, \`level_num\`),
                 \`stage\` = COALESCE(?, \`stage\`),
                 \`pet_id\` = COALESCE(?, \`pet_id\`),
                 \`pet_name\` = COALESCE(?, \`pet_name\`),
                 \`pet_hatched\` = TRUE
             WHERE \`id\` = ?`,
            [
              restoredScore,
              restoredExp,
              restoredProgress,
              restoredLevel,
              restoredStage,
              restoredPetId,
              restoredPetName,
              student.id,
            ],
          );
        }
      }
    }

    // 2.5 检查 pet_points_operations 历史操作快照，若有积分为 0 但在 operations 中有更高分记录，自动恢复
    if (await queryRunner.hasTable('pet_points_operations')) {
      const ops: Array<{
        operation_id: string;
        teacher_id: string;
        result: string | Record<string, unknown>;
        created_at: Date;
      }> = await queryRunner.query(
        'SELECT operation_id, teacher_id, result, created_at FROM pet_points_operations ORDER BY created_at ASC',
      );

      const latestByStudent = new Map<
        string,
        {
          score: number;
          petExperience: number;
          petProgress: number;
          level: number;
          stage: string;
          petId: string | null;
          petName: string | null;
          completedPets: number;
          trophies: number;
          cycleId?: string;
        }
      >();

      for (const op of ops) {
        let res = op.result;
        if (typeof res === 'string') {
          try {
            res = JSON.parse(res);
          } catch {
            continue;
          }
        }
        if (
          res &&
          typeof res === 'object' &&
          Array.isArray((res as { students?: unknown[] }).students)
        ) {
          for (const s of (res as { students: Array<Record<string, unknown>> })
            .students) {
            const studentId = String(s.id ?? '');
            const studentName = String(s.name ?? '');
            const classId = String(s.classId ?? '');
            const score = typeof s.score === 'number' ? s.score : 0;
            const completed =
              typeof s.completedPets === 'number' ? s.completedPets : 0;
            if (score > 0 || completed > 0) {
              const payload = {
                score,
                petExperience:
                  typeof s.petExperience === 'number' ? s.petExperience : 0,
                petProgress:
                  typeof s.petProgress === 'number' ? s.petProgress : 0,
                level: typeof s.level === 'number' ? s.level : 1,
                stage: typeof s.stage === 'string' ? s.stage : '初始形态',
                petId: typeof s.petId === 'string' ? s.petId : null,
                petName: typeof s.petName === 'string' ? s.petName : null,
                completedPets: completed,
                trophies: typeof s.trophies === 'number' ? s.trophies : 0,
                cycleId: typeof s.cycleId === 'string' ? s.cycleId : undefined,
              };
              if (studentId) latestByStudent.set(`id:${studentId}`, payload);
              if (studentName && classId)
                latestByStudent.set(`name:${classId}:${studentName}`, payload);
            }
          }
        }
      }

      for (const [key, payload] of latestByStudent.entries()) {
        if (key.startsWith('id:')) {
          const id = key.slice(3);
          await queryRunner.query(
            `UPDATE \`pet_points_students\`
             SET \`score\` = GREATEST(\`score\`, ?),
                 \`completed_pets\` = GREATEST(\`completed_pets\`, ?),
                 \`trophies\` = GREATEST(\`trophies\`, ?),
                 \`pet_experience\` = CASE WHEN \`score\` = 0 THEN ? ELSE \`pet_experience\` END,
                 \`pet_progress\` = CASE WHEN \`score\` = 0 THEN ? ELSE \`pet_progress\` END,
                 \`level_num\` = CASE WHEN \`score\` = 0 THEN ? ELSE \`level_num\` END,
                 \`stage\` = CASE WHEN \`score\` = 0 THEN ? ELSE \`stage\` END,
                 \`pet_id\` = CASE WHEN \`score\` = 0 THEN COALESCE(?, \`pet_id\`) ELSE \`pet_id\` END,
                 \`pet_name\` = CASE WHEN \`score\` = 0 THEN COALESCE(?, \`pet_name\`) ELSE \`pet_name\` END,
                 \`pet_hatched\` = CASE WHEN \`score\` = 0 AND ? IS NOT NULL THEN TRUE ELSE \`pet_hatched\` END
             WHERE (\`id\` = ? OR \`id\` LIKE ? OR \`logical_id\` = ?) AND \`score\` = 0`,
            [
              payload.score,
              payload.completedPets,
              payload.trophies,
              payload.petExperience,
              payload.petProgress,
              payload.level,
              payload.stage,
              payload.petId,
              payload.petName,
              payload.petId,
              id,
              `%:${id}`,
              id,
            ],
          );
        } else if (key.startsWith('name:')) {
          const [, classId, name] = key.split(':');
          await queryRunner.query(
            `UPDATE \`pet_points_students\`
             SET \`score\` = GREATEST(\`score\`, ?),
                 \`completed_pets\` = GREATEST(\`completed_pets\`, ?),
                 \`trophies\` = GREATEST(\`trophies\`, ?),
                 \`pet_experience\` = CASE WHEN \`score\` = 0 THEN ? ELSE \`pet_experience\` END,
                 \`pet_progress\` = CASE WHEN \`score\` = 0 THEN ? ELSE \`pet_progress\` END,
                 \`level_num\` = CASE WHEN \`score\` = 0 THEN ? ELSE \`level_num\` END,
                 \`stage\` = CASE WHEN \`score\` = 0 THEN ? ELSE \`stage\` END,
                 \`pet_id\` = CASE WHEN \`score\` = 0 THEN COALESCE(?, \`pet_id\`) ELSE \`pet_id\` END,
                 \`pet_name\` = CASE WHEN \`score\` = 0 THEN COALESCE(?, \`pet_name\`) ELSE \`pet_name\` END,
                 \`pet_hatched\` = CASE WHEN \`score\` = 0 AND ? IS NOT NULL THEN TRUE ELSE \`pet_hatched\` END
             WHERE \`class_id\` = ? AND \`name\` = ? AND \`score\` = 0`,
            [
              payload.score,
              payload.completedPets,
              payload.trophies,
              payload.petExperience,
              payload.petProgress,
              payload.level,
              payload.stage,
              payload.petId,
              payload.petName,
              payload.petId,
              classId,
              name,
            ],
          );
        }
      }
    }

    // 3. 兜底保障：精准恢复林郅宸、庄坤翔、陈荣涵与王峻宇的数据状态
    await queryRunner.query(
      `UPDATE \`pet_points_students\`
       SET \`score\` = 297,
           \`pet_experience\` = 97,
           \`pet_progress\` = 24,
           \`level_num\` = 5,
           \`stage\` = '第5形态',
           \`pet_id\` = 'star-compass-fox',
           \`pet_name\` = '星巡狐',
           \`pet_hatched\` = TRUE,
           \`completed_pets\` = 1,
           \`trophies\` = 1
       WHERE \`id\` LIKE '%class-1787553906595-ed850i:2026016%'
          OR (\`name\` = '林郅宸' AND \`class_id\` = 'class-1787553906595-ed850i')`,
    );

    await queryRunner.query(
      `UPDATE \`pet_points_students\`
       SET \`score\` = 259,
           \`pet_experience\` = 59,
           \`pet_progress\` = 20,
           \`level_num\` = 3,
           \`stage\` = '第3形态',
           \`pet_id\` = 'coral-whale',
           \`pet_name\` = '珊瑚鲸',
           \`pet_hatched\` = TRUE,
           \`completed_pets\` = 1,
           \`trophies\` = 1,
           \`cycle_id\` = 'cycle-1793150268346-46khxw'
       WHERE \`id\` LIKE '%class-1787553906595-ed850i:2026018%'
          OR (\`name\` = '庄坤翔' AND \`class_id\` = 'class-1787553906595-ed850i')`,
    );

    await queryRunner.query(
      `UPDATE \`pet_points_students\`
       SET \`score\` = 125,
           \`pet_experience\` = 125,
           \`pet_progress\` = 145,
           \`level_num\` = 6,
           \`stage\` = '第6形态',
           \`pet_id\` = 'bubble-otter',
           \`pet_name\` = '泡泡獭',
           \`pet_hatched\` = TRUE,
           \`completed_pets\` = 0,
           \`trophies\` = 0,
           \`cycle_id\` = 'cycle-feee69c6-c858-11f1-b95c-0242ac120002'
       WHERE \`id\` LIKE '%class-1787553906595-ed850i:2026017%'
          OR (\`name\` = '陈荣涵' AND \`class_id\` = 'class-1787553906595-ed850i')`,
    );

    await queryRunner.query(
      `UPDATE \`pet_points_students\`
       SET \`completed_pets\` = 2,
           \`trophies\` = 2
       WHERE \`id\` LIKE '%class-1787553906701-yfdl3g:2026012%'
          OR (\`name\` = '王峻宇' AND \`class_id\` = 'class-1787553906701-yfdl3g')`,
    );
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // 恢复历史数据操作不可逆，无需执行清空操作
  }
}
