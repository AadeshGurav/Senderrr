import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity({ name: 'scraped_articles' })
export class ScrapedArticle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 1024 })
  url: string;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  imageUrl: string | null;

  @Column({ type: 'simple-json', nullable: true })
  bulletPoints: string[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceName: string | null;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
