import { Entity, Column, UpdateDateColumn } from 'typeorm';

const isPostgres = (): boolean => process.env.DATABASE_TYPE === 'postgres';

/**
 * WhatsApp session state stored by whatsapp-web.js RemoteAuth.
 * Persisted to Postgres so sessions survive Render free-tier restarts.
 *
 * RemoteAuth serializes the session state as a zip file and calls save().
 * We store the raw bytes as BYTEA (Postgres) / blob (SQLite).
 */
@Entity('wa_sessions')
export class WaSession {
  @Column({ type: 'text', name: 'session_name', primary: true })
  sessionName: string;

  @Column({ type: isPostgres() ? 'bytea' : 'blob' })
  data: Buffer;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}