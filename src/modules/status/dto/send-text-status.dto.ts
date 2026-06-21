import { IsString, IsOptional, IsInt, Min, Max, Matches } from 'class-validator';

export class SendTextStatusDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'backgroundColor must be a hex color (e.g., #25D366)' })
  backgroundColor?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  font?: number;
}
