import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ContentPostType } from '@prisma/client';

export class ListPostsQueryDto {
  @IsOptional() @IsEnum(ContentPostType) type?: ContentPostType;

  @IsOptional() @IsBoolean() @Type(() => Boolean) is_draft?: boolean;

  @IsOptional() @IsISO8601() since?: string;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page: number = 1;

  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit: number = 20;
}
