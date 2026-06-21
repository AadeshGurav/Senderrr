import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarmUpDayToAdminAccounts1780000000000 implements MigrationInterface {
  name = 'AddWarmUpDayToAdminAccounts1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_accounts" ADD COLUMN "warmUpDay" integer DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_accounts" DROP COLUMN "warmUpDay"`);
  }

}