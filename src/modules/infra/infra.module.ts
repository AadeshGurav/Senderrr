import { Module } from '@nestjs/common';
import { InfraController } from './infra.controller';
import { EngineModule } from '../../engine/engine.module';
import { DockerModule } from '../docker';

@Module({
  imports: [EngineModule, DockerModule],
  controllers: [InfraController],
})
export class InfraModule {}
