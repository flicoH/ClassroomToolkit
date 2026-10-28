import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPetStateHistory20261010000000 implements MigrationInterface {
  name = 'AddPetStateHistory20261010000000';
  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS pet_points_state_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      teacher_id VARCHAR(64) NOT NULL,
      student_id VARCHAR(64) NOT NULL,
      recorded_at DATETIME(3) NOT NULL,
      pet JSON NULL,
      INDEX idx_pet_history_as_of (teacher_id, student_id, recorded_at, id)
    ) ENGINE=InnoDB`);
    // Only establish today's known state; old scores cannot recover adoptions or settings.
    await queryRunner.query(
      `INSERT INTO pet_points_state_history (teacher_id, student_id, recorded_at, pet)
      SELECT s.teacher_id, s.id, ?, JSON_OBJECT(
        'petId', s.pet_id, 'petName', s.pet_name, 'level', s.level_num,
        'stage', s.stage, 'petHatched', IF(s.pet_hatched, CAST('true' AS JSON), CAST('false' AS JSON)))
      FROM pet_points_students s WHERE NOT EXISTS (
        SELECT 1 FROM pet_points_state_history h WHERE h.teacher_id = s.teacher_id AND h.student_id = s.id
      )`,
      [new Date()],
    );
  }
  async down() {
    throw new Error('宠物历史不可通过回滚删除；请回滚应用并保留历史表');
  }
}
