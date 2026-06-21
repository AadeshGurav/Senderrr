import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SendProductDto {
  @IsString()
  chatId: string;

  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  body?: string;
}

export class SendCatalogDto {
  @IsString()
  chatId: string;

  @IsOptional()
  @IsString()
  body?: string;
}

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
