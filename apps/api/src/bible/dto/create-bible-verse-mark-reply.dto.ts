import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Resposta a uma marcação do feed da Bíblia. Mesmo piso de 3 caracteres da
 * marcação (espaço em branco puro não conta — o trim roda antes), teto menor:
 * resposta é conversa sobre a reflexão, não a reflexão.
 */
export class CreateBibleVerseMarkReplyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'A resposta precisa ter ao menos 3 caracteres' })
  @MaxLength(1000, { message: 'A resposta não pode passar de 1000 caracteres' })
  comment!: string;
}
