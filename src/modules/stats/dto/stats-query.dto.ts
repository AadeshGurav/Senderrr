import { IsOptional, IsIn } from 'class-validator';

export class StatsQueryDto {
  @IsOptional()
  @IsIn(['24h', '7d', '30d'])
  period?: '24h' | '7d' | '30d' = '24h';
}
