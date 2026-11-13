import type { MigrationInterface, QueryRunner } from 'typeorm';
export class LoginIpRestrictions20261031000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE analytics_events ADD login_ip varchar(45) NULL, ADD ip_location varchar(255) NULL',
    );
    await queryRunner.query(
      'CREATE TABLE blocked_login_ips (ip varchar(45) NOT NULL PRIMARY KEY) ENGINE=InnoDB',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE analytics_events DROP COLUMN login_ip, DROP COLUMN ip_location',
    );
    await queryRunner.query('DROP TABLE blocked_login_ips');
  }
}
