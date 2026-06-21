import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity({ name: 'admin_sessions' })
export class AdminSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  adminId: number;

  @Column({ default: 0 })
  sessionIndex: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  openwaSessionId: string;

  @Column({ type: 'varchar', length: 20, default: 'created' })
  openwaSessionStatus: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pushName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
