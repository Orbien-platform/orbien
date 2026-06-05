import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export type MaterialStatus = 'scheduled' | 'published' | 'expired';

export class ListStudyMaterialsQueryDto {
  @IsOptional()
  @IsIn(['scheduled', 'published', 'expired'], { message: 'status inválido' })
  status?: MaterialStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
