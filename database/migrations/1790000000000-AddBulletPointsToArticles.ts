import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBulletPointsToArticles1790000000000 implements MigrationInterface {
  name = 'AddBulletPointsToArticles1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists before adding
    const table = await queryRunner.getTable('scraped_articles');
    const col = table?.findColumnByName('bulletPoints');
    if (!col) {
      try {
        // Use TEXT for SQLite (JSON stored as text), JSON for PostgreSQL
        const dbType = queryRunner.connection.driver.options.type;
        if (dbType === 'postgres') {
          await queryRunner.query(`ALTER TABLE "scraped_articles" ADD COLUMN "bulletPoints" json DEFAULT NULL`);
        } else {
          await queryRunner.query(`ALTER TABLE "scraped_articles" ADD COLUMN "bulletPoints" text DEFAULT NULL`);
        }
      } catch {
        // Column might already exist
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('scraped_articles');
    const col = table?.findColumnByName('bulletPoints');
    if (col) {
      try {
        await queryRunner.query(`ALTER TABLE "scraped_articles" DROP COLUMN "bulletPoints"`);
      } catch {
        // Ignore
      }
    }
  }
}
