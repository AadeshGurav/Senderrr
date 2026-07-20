import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WaAuthController } from './wa-auth.controller';
import { WaAuthService } from './wa-auth.service';
import { WaAuthGuard } from './wa-auth.guard';
import { WaUser } from '@database/entities/wa-automation/wa-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WaUser], 'data'),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('waAuth.jwtSecret', 'wa-automation-jwt-secret-change-me'),
        signOptions: { expiresIn: '365d' },
      }),
    }),
  ],
  controllers: [WaAuthController],
  providers: [WaAuthService, WaAuthGuard],
  exports: [WaAuthService, WaAuthGuard, JwtModule],
})
export class WaAuthModule {}
