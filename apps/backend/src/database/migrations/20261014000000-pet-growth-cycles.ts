import type { MigrationInterface, QueryRunner } from 'typeorm';

/** MySQL DDL commits implicitly: missing-column checks allow a stopped deployment to resume safely. */
export class PetGrowthCycles20261014000000 implements MigrationInterface {
  name = 'PetGrowthCycles20261014000000';
  async up(runner: QueryRunner) {
    const studentColumns = [
      ['logical_id', 'VARCHAR(64) NULL'],
      ['roster_active', 'BOOLEAN NOT NULL DEFAULT TRUE'],
      ['pet_experience', 'INT NOT NULL DEFAULT 0'],
      ['cycle_id', "VARCHAR(64) NOT NULL DEFAULT ''"],
      ['revision', 'INT NOT NULL DEFAULT 0'],
      ['completion_pending', 'BOOLEAN NOT NULL DEFAULT FALSE'],
      ['cycle_rules_version', 'INT NOT NULL DEFAULT 1'],
      ['reward_grants', 'JSON NULL'],
      ['reward_protection', 'JSON NULL'],
      ['migration_evidence', 'JSON NULL'],
    ];
    for (const [name, definition] of studentColumns) {
      if (!(await runner.hasColumn('pet_points_students', name!)))
        await runner.query(
          `ALTER TABLE pet_points_students ADD ${name} ${definition}`,
        );
    }
    if (!(await runner.hasColumn('pet_points_settings', 'version')))
      await runner.query(
        'ALTER TABLE pet_points_settings ADD version INT NOT NULL DEFAULT 1',
      );
    // Recover the canonical roster ID where it is known; retain storage keys and every historical FK.
    await runner.query(`UPDATE pet_points_students p LEFT JOIN student_students c ON
      c.teacher_id=p.teacher_id AND c.classroom_id=p.class_id AND c.student_no=p.student_no
      SET p.logical_id=COALESCE(c.id,IF(LEFT(p.id,CHAR_LENGTH(p.teacher_id)+1)=CONCAT(p.teacher_id,':'),SUBSTRING(p.id,CHAR_LENGTH(p.teacher_id)+2),p.id))
      WHERE p.logical_id IS NULL`);
    const experience = `CASE WHEN s.score >= COALESCE(r.final_energy,200) THEN s.score ELSE
      LEAST(s.score,FLOOR((FLOOR(GREATEST(s.score,0)*(COALESCE(r.max_level,10)-1)/COALESCE(r.final_energy,200))+1)*COALESCE(r.final_energy,200)/(COALESCE(r.max_level,10)-1)+0.5)-1) END`;
    const protection = Array.from(
      { length: 9 },
      (_, i) => `IF(s.level_num>=${i + 2},JSON_ARRAY(${i + 2}),JSON_ARRAY())`,
    ).join(',');
    // Initialize every fact and its provenance in one statement. Existing new cycles are never remapped.
    await runner.query(`UPDATE pet_points_students s LEFT JOIN pet_points_settings r ON r.teacher_id=s.teacher_id
      SET s.pet_experience=${experience}, s.cycle_id=CONCAT('cycle-',UUID()),
      s.reward_grants=JSON_ARRAY(), s.reward_protection=JSON_MERGE_PRESERVE(${protection}),
      s.migration_evidence=JSON_OBJECT('score',s.score,'level',s.level_num,'experience',${experience}),
      s.pet_hatched=(s.pet_id IS NOT NULL AND s.level_num>1),
      s.completion_pending=(s.pet_id IS NOT NULL AND s.score>=COALESCE(r.final_energy,200))
      WHERE s.cycle_id='' AND s.migration_evidence IS NULL`);
    await runner.query(
      'ALTER TABLE pet_points_students MODIFY reward_grants JSON NOT NULL, MODIFY reward_protection JSON NOT NULL',
    );
    const recordColumns = [
      ['score_delta', 'INT NULL'],
      ['experience_delta', 'INT NULL'],
      ['cycle_id', 'VARCHAR(64) NULL'],
      ['before_values', 'JSON NULL'],
      ['after_values', 'JSON NULL'],
    ];
    for (const [name, definition] of recordColumns) {
      if (!(await runner.hasColumn('pet_points_evaluation_records', name!)))
        await runner.query(
          `ALTER TABLE pet_points_evaluation_records ADD ${name} ${definition}`,
        );
    }
    await runner.query(`CREATE TABLE IF NOT EXISTS pet_points_completed (
      id VARCHAR(64) PRIMARY KEY, teacher_id VARCHAR(64) NOT NULL, student_id VARCHAR(64) NOT NULL,
      cycle_id VARCHAR(64) NOT NULL, snapshot JSON NOT NULL,
      UNIQUE KEY uq_pet_completed_cycle(teacher_id,student_id,cycle_id)) ENGINE=InnoDB`);
    await runner.query(`CREATE TABLE IF NOT EXISTS pet_points_operations (
      teacher_id VARCHAR(64) NOT NULL, operation_id VARCHAR(64) NOT NULL, payload_hash VARCHAR(64) NOT NULL,
      result JSON NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY(teacher_id,operation_id)) ENGINE=InnoDB`);
  }
  async down() {
    throw new Error(
      '养成轮次已分离积分和经验，不允许删列回滚；保留档案并使用兼容后端',
    );
  }
}
