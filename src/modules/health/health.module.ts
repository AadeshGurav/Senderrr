import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';

/**
 * HealthModule — provides health check and liveness/readiness endpoints.
 *
 * Imports TypeOrmModule to access the named DataSource instances (main and data)
 * for the readiness probe that verifies database connectivity.
 * Without this import, @InjectDataSource('main') and @InjectDataSource('data')
 * fail at startup because the tokens are not available in this module's context.
 */
@Module({
  imports: [
    // Bring in the named DataSource instances from the root TypeOrmModule.
    // This allows HealthController to inject @InjectDataSource('main') and
    // @InjectDataSource('data') for the readiness check.
    TypeOrmModule.forFeature([], 'main'),
    TypeOrmModule.forFeature([], 'data'),
  ],
  controllers: [HealthController],
})
export class HealthModule {}