import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ContentPostType } from '@prisma/client';

export class ListPostsQueryDto {
  @IsOptional() @IsEnum(ContentPostType) type?: ContentPostType;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  is_draft?: boolean;

  @IsOptional() @IsISO8601() since?: string;

  /**
   * Só o que já está no ar: não é rascunho e já tem `published_at`. É o que o
   * app mobile pede — lá é vitrine, e quem tem papel de escrita não deve ver
   * o próprio rascunho misturado ao feed. O filtro de `member` puro continua
   * valendo sem este parâmetro; ele existe para quem **pode** ver rascunho
   * dizer que não quer.
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  published?: boolean;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page: number = 1;

  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit: number = 20;
}
