import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class MediaInput {
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  base64?: string;
}

export class SendImageStatusDto {
  @ValidateNested()
  @Type(() => MediaInput)
  image: MediaInput;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class SendVideoStatusDto {
  @ValidateNested()
  @Type(() => MediaInput)
  video: MediaInput;

  @IsOptional()
  @IsString()
  caption?: string;
}
