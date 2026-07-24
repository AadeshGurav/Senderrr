import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EngineFactory } from './engine.factory';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([], 'data')],
  providers: [EngineFactory],
  exports: [EngineFactory],
})
export class EngineModule {}
