import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'scraper_activity_log' })
export class ScraperActivityLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 1024 })
  url: string;

  @Column({ default: 0 })
  articlesFound: number;

  @Column({ default: 0 })
  articlesNew: number;

  @Column({ default: 0 })
  articlesSkipped: number;

  @Column({ default: 0 })
  articlesFailed: number;

  @Column({ default: false })
  listingChanged: boolean;

  @Column({ type: 'text', nullable: true })
  errors: string | null;

  @Column({ default: 0 })
  durationMs: number;

  @CreateDateColumn()
  checkedAt: Date;
}
