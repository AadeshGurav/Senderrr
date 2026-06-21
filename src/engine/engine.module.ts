import { Global, Module } from '@nestjs/common';
import { EngineFactory } from './engine.factory';

@Global()
@Module({
  providers: [EngineFactory],
  exports: [EngineFactory],
})
export class EngineModule {}
