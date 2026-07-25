import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { WaSession } from '@database/entities/whatsapp/wa-session.entity';

/**
 * RemoteAuth store backed by PostgreSQL.
 *
 * whatsapp-web.js RemoteAuth serializes the browser session state as a zip
 * file and calls save() after compressing. The zip file lives at
 * `<dataPath>/<sessionName>.zip` — we read it from there and UPSERT into
 * Postgres. On extract, we write the stored bytes back to the path RemoteAuth
 * provides and it unzips from there.
 *
 * Multi-tenant: each connected WhatsApp number gets its own session row keyed
 * by the clientId passed to RemoteAuth.
 */
export class PostgresRemoteAuthStore {
  constructor(private readonly dataSource: DataSource) {}

  async sessionExists({ session }: { session: string }): Promise<boolean> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      const result = await queryRunner.query(
        'SELECT 1 FROM wa_sessions WHERE session_name = $1 LIMIT 1',
        [session],
      );
      return result.length > 0;
    } finally {
      await queryRunner.release();
    }
  }

  async save({ session }: { session: string }): Promise<void> {
    // RemoteAuth creates the zip at dataPath/<sessionName>.zip before calling save()
    const zipPath = path.join(process.cwd(), '.wwebjs_auth', `${session}.zip`);
    const data = fs.readFileSync(zipPath);

    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.query(
        `INSERT INTO wa_sessions (session_name, data, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (session_name)
         DO UPDATE SET data = $2, updated_at = now()`,
        [session, data],
      );
    } finally {
      await queryRunner.release();
    }
  }

  async extract({ session, path: destPath }: { session: string; path: string }): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    let result;
    try {
      result = await queryRunner.query(
        'SELECT data FROM wa_sessions WHERE session_name = $1',
        [session],
      );
    } finally {
      await queryRunner.release();
    }

    if (result.length === 0) {
      throw new Error(`Session ${session} not found in wa_sessions`);
    }

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(destPath, result[0].data);
  }

  async delete({ session }: { session: string }): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.query('DELETE FROM wa_sessions WHERE session_name = $1', [
        session,
      ]);
    } finally {
      await queryRunner.release();
    }
  }
}