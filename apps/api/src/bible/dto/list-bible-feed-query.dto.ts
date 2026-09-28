import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Paginação do feed por cursor, espelhando `ListGroupMessagesQueryDto`
 * (biblia-nvi-marcacoes-mobile, BIB-08).
 *
 * `before`: id da marcação mais antiga já na tela — devolve o que veio
 * antes dela (rolar para o passado, "carregar mais", spec.md AC3). É o
 * único cursor que o feed usa de fato: diferente do chat, não há tela de
 * polling que precise de `after` aqui, mas o campo é mantido pela mesma
 * forma do DTO reaproveitado (design.md, Code Reuse Analysis).
 */
export class ListBibleFeedQueryDto {
  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @IsUUID()
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
