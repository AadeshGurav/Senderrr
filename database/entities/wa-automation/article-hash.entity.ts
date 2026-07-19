import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity({ name: 'article_hashes' })
export class ArticleHash {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 1024 })
  url: string;

  @Column({ type: 'varchar', length: 64 })
  contentHash: string;

  @CreateDateColumn()
  checkedAt: Date;
}
