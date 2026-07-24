import 'reflect-metadata';
import { DataSource, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
class TestEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: Date, nullable: true })
  myDate: Date | null;
}

async function run() {
  const ds = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [TestEntity],
    synchronize: true,
  });
  await ds.initialize();
  console.log('SQLite works!');
  await ds.destroy();
}
run().catch(console.error);
