import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdTemplates1795000000000 implements MigrationInterface {
  name = 'AddAdTemplates1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dbType = queryRunner.connection.driver.options.type;

    if (dbType === 'postgres') {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "ad_templates" (
          "id" SERIAL NOT NULL,
          "name" VARCHAR(255) NOT NULL,
          "body" TEXT,
          "isActive" BOOLEAN NOT NULL DEFAULT false,
          "mediaId" INTEGER,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "advertisementId" INTEGER,
          CONSTRAINT "PK_ad_templates" PRIMARY KEY ("id"),
          CONSTRAINT "FK_ad_template_advertisement" FOREIGN KEY ("advertisementId")
            REFERENCES "advertisements"(id) ON DELETE CASCADE,
          CONSTRAINT "FK_ad_template_media" FOREIGN KEY ("mediaId")
            REFERENCES "media_attachments"(id) ON DELETE SET NULL
        )
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_ad_template_advertisement"
          ON "ad_templates" ("advertisementId")
      `);
    } else {
      // SQLite
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "ad_templates" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          "name" VARCHAR(255) NOT NULL,
          "body" TEXT,
          "isActive" BOOLEAN NOT NULL DEFAULT 0,
          "mediaId" INTEGER,
          "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
          "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now')),
          "advertisementId" INTEGER,
          FOREIGN KEY ("advertisementId") REFERENCES "advertisements"(id) ON DELETE CASCADE,
          FOREIGN KEY ("mediaId") REFERENCES "media_attachments"(id) ON DELETE SET NULL
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ad_templates"`);
  }
}
