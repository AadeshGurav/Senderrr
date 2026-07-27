import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdvertisementTitleToBroadcasts1796000000000 implements MigrationInterface {
  name = 'AddAdvertisementTitleToBroadcasts1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dbType = queryRunner.connection.driver.options.type;

    const table = await queryRunner.getTable('broadcast_events');
    if (!table) return;
    const col = table.findColumnByName('advertisementTitle');
    if (col) return;

    if (dbType === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "broadcast_events" ADD COLUMN "advertisementTitle" VARCHAR(255) DEFAULT NULL`,
      );
    } else {
      await queryRunner.query(
        `ALTER TABLE "broadcast_events" ADD COLUMN "advertisementTitle" VARCHAR(255) DEFAULT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('broadcast_events');
    if (!table) return;
    const col = table.findColumnByName('advertisementTitle');
    if (col) {
      await queryRunner.query(`ALTER TABLE "broadcast_events" DROP COLUMN "advertisementTitle"`);
    }
  }
}
