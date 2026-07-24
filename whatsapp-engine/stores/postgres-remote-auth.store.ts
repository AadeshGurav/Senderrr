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
    const result = await this.dataSource.query(
      'SELECT 1 FROM wa_sessions WHERE session_name = $1 LIMIT 1',
      [session],
    );
    return result.length > 0;
  }

  async save({ session }: { session: string }): Promise<void> {
    // RemoteAuth creates the zip at dataPath/<sessionName>.zip before calling save()
    const zipPath = path.join(process.cwd(), '.wwebjs_auth', `${session}.zip`);
    const data = fs.readFileSync(zipPath);

    await this.dataSource.query(
      `INSERT INTO wa_sessions (session_name, data, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (session_name)
       DO UPDATE SET data = $2, updated_at = now()`,
      [session, data],
    );
  }

  async extract({ session, path: destPath }: { session: string; path: string }): Promise<void> {
    const result = await this.dataSource.query(
      'SELECT data FROM wa_sessions WHERE session_name = $1',
      [session],
    );

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
    await this.dataSource.query('DELETE FROM wa_sessions WHERE session_name = $1', [
      session,
    ]);
  }
}