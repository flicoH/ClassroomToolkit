import type { MigrationInterface } from 'typeorm';

export class AddSeatingChartClassroomSyncFields20260824000000 implements MigrationInterface {
  name = 'AddSeatingChartClassroomSyncFields20260824000000';

  async up() {
    // No-op: seating chart classroom sync no longer depends on extra columns.
  }

  async down() {
    // No-op: keep existing production data untouched.
  }
}
