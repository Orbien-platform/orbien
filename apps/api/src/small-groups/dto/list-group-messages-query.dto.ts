import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Paginação do chat é por cursor, não por página: a lista cresce pelo fim e
 * `page`/`offset` repetiria ou puliria mensagem a cada nova chegada enquanto
 * alguém rola o histórico.
 *
 * - `before`: id da mensagem mais antiga já na tela — devolve o que veio
 *   antes dela (rolar para cima).
 * - `after`: id da mensagem mais nova já na tela — devolve só o que chegou
 *   depois (é o que o polling do front usa, para não rebaixar a conversa
 *   inteira a cada ciclo).
 *
 * Os dois juntos não fazem sentido e o service rejeita.
 */
export class ListGroupMessagesQueryDto {
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
