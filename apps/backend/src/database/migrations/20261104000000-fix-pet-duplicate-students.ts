import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPetDuplicateStudents20261104000000 implements MigrationInterface {
  name = 'FixPetDuplicateStudents20261104000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 恢复一年级（grade-1）中因初始 Seed 复制失真而丢失的 2 位学生名称（林俊杰、陈奕迅）
    if (await queryRunner.hasTable('student_students')) {
      await queryRunner.query(
        "UPDATE `student_students` SET `name` = '林俊杰' WHERE `student_no` = '2026001' AND `classroom_id` = 'grade-1' AND `name` = '周杰伦'",
      );
      await queryRunner.query(
        "UPDATE `student_students` SET `name` = '陈奕迅' WHERE `student_no` = '2026003' AND `classroom_id` = 'grade-1' AND `name` = '周杰伦'",
      );
    }

    if (await queryRunner.hasTable('pet_points_students')) {
      await queryRunner.query(
        "UPDATE `pet_points_students` SET `name` = '林俊杰' WHERE `student_no` = '2026001' AND `class_id` = 'grade-1' AND `name` = '周杰伦'",
      );
      await queryRunner.query(
        "UPDATE `pet_points_students` SET `name` = '陈奕迅' WHERE `student_no` = '2026003' AND `class_id` = 'grade-1' AND `name` = '周杰伦'",
      );
    }

    if (await queryRunner.hasTable('task_stats_students')) {
      await queryRunner.query(
        "UPDATE `task_stats_students` SET `name` = '林俊杰' WHERE `student_no` = '2026001' AND `name` = '周杰伦'",
      );
      await queryRunner.query(
        "UPDATE `task_stats_students` SET `name` = '陈奕迅' WHERE `student_no` = '2026003' AND `name` = '周杰伦'",
      );
    }

    // 2. 清理并合并 pet_points_students 中同教师、同班级、同学号的重复记录
    if (await queryRunner.hasTable('pet_points_students')) {
      const duplicateGroups: Array<{
        teacher_id: string;
        class_id: string;
        student_no: string;
      }> = await queryRunner.query(`
        SELECT teacher_id, class_id, student_no
        FROM pet_points_students
        GROUP BY teacher_id, class_id, student_no
        HAVING COUNT(*) > 1
      `);

      for (const group of duplicateGroups) {
        const rows: Array<{
          id: string;
          score: number;
          trophies: number;
          pet_id: string | null;
          pet_name: string | null;
          pet_progress: number;
          pet_hatched: boolean | number;
          level_num: number;
          stage: string;
          pet_experience: number;
          logical_id: string | null;
          roster_active: boolean | number;
          revision: number;
        }> = await queryRunner.query(
          `SELECT * FROM pet_points_students 
           WHERE teacher_id = ? AND class_id = ? AND student_no = ?
           ORDER BY score DESC, trophies DESC, (pet_id IS NOT NULL) DESC, roster_active DESC, revision DESC`,
          [group.teacher_id, group.class_id, group.student_no],
        );

        if (rows.length <= 1) continue;
        const [primary, ...redundants] = rows;
        if (!primary) continue;

        let bestScore = primary.score;
        let bestExperience = primary.pet_experience;
        let bestTrophies = primary.trophies;
        let bestPetId = primary.pet_id;
        let bestPetName = primary.pet_name;
        let bestPetProgress = primary.pet_progress;
        let bestPetHatched = primary.pet_hatched;
        let bestLevel = primary.level_num;
        let bestStage = primary.stage;
        let logicalId = primary.logical_id;

        for (const extra of redundants) {
          if (!logicalId && extra.logical_id) {
            logicalId = extra.logical_id;
          }
          if (extra.score > bestScore) {
            bestScore = extra.score;
            bestExperience = extra.pet_experience;
            bestLevel = extra.level_num;
            bestStage = extra.stage;
          }
          if (!bestPetId && extra.pet_id) {
            bestPetId = extra.pet_id;
            bestPetName = extra.pet_name;
            bestPetProgress = extra.pet_progress;
            bestPetHatched = extra.pet_hatched;
          }
          if (extra.trophies > bestTrophies) {
            bestTrophies = extra.trophies;
          }

          // 安全重定向外键关联数据到主记录
          if (await queryRunner.hasTable('pet_points_evaluation_records')) {
            await queryRunner.query(
              'UPDATE `pet_points_evaluation_records` SET `student_id` = ? WHERE `student_id` = ?',
              [primary.id, extra.id],
            );
          }
          if (await queryRunner.hasTable('pet_points_redemptions')) {
            await queryRunner.query(
              'UPDATE `pet_points_redemptions` SET `student_id` = ? WHERE `student_id` = ?',
              [primary.id, extra.id],
            );
          }
          if (await queryRunner.hasTable('pet_points_completed')) {
            await queryRunner.query(
              'DELETE FROM `pet_points_completed` WHERE `student_id` = ? AND `cycle_id` IN (SELECT `cycle_id` FROM (SELECT `cycle_id` FROM `pet_points_completed` WHERE `student_id` = ?) t)',
              [extra.id, primary.id],
            );
            await queryRunner.query(
              'UPDATE `pet_points_completed` SET `student_id` = ? WHERE `student_id` = ?',
              [primary.id, extra.id],
            );
          }
          if (await queryRunner.hasTable('pet_points_state_history')) {
            await queryRunner.query(
              'UPDATE `pet_points_state_history` SET `student_id` = ? WHERE `student_id` = ?',
              [primary.id, extra.id],
            );
          }

          // 删除已迁移完毕的冗余学生记录
          await queryRunner.query(
            'DELETE FROM `pet_points_students` WHERE `id` = ?',
            [extra.id],
          );
        }

        // 回填合并后的属性并确保主记录激活
        await queryRunner.query(
          `UPDATE ` +
            '`pet_points_students` ' +
            'SET `score` = ?, `pet_experience` = ?, `trophies` = ?, `pet_id` = ?, `pet_name` = ?, ' +
            '`pet_progress` = ?, `pet_hatched` = ?, `level_num` = ?, `stage` = ?, `logical_id` = ?, `roster_active` = TRUE ' +
            'WHERE `id` = ?',
          [
            bestScore,
            bestExperience,
            bestTrophies,
            bestPetId,
            bestPetName,
            bestPetProgress,
            bestPetHatched,
            bestLevel,
            bestStage,
            logicalId,
            primary.id,
          ],
        );
      }

      // 3. 补齐已关联但缺失 logical_id 的记录
      if (await queryRunner.hasTable('student_students')) {
        await queryRunner.query(`
          UPDATE pet_points_students p
          INNER JOIN student_students s ON s.teacher_id = p.teacher_id AND s.classroom_id = p.class_id AND s.student_no = p.student_no
          SET p.logical_id = s.id
          WHERE p.logical_id IS NULL OR p.logical_id = ''
        `);
      }
    }
  }

  async down(): Promise<void> {
    // 数据修复类迁移不执行逆向破坏性回滚，保留正确学生档案
  }
}
