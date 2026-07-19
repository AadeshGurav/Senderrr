import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarmUpDayToAdminAccounts1780000000000 implements MigrationInterface {
  name = 'AddWarmUpDayToAdminAccounts1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists before adding
    const table = await queryRunner.getTable('admin_accounts');
    const col = table?.findColumnByName('warmUpDay');
    if (!col) {
      try {
        await queryRunner.query(`ALTER TABLE "admin_accounts" ADD COLUMN "warmUpDay" integer DEFAULT 0`);
      } catch {
        // Column might already exist from manual migration
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('admin_accounts');
    const col = table?.findColumnByName('warmUpDay');
    if (col) {
      try {
        await queryRunner.query(`ALTER TABLE "admin_accounts" DROP COLUMN "warmUpDay"`);
      } catch {
        // Ignore
      }
    }
  }

}