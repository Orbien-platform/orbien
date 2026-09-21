import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Edição do próprio comentário (biblia-nvi-marcacoes-mobile, BIB-09). Só o
 * texto muda — livro, capítulo e intervalo de versículos são imutáveis após
 * a criação (a spec não pede "editar o intervalo", só o comentário).
 */
export class UpdateBibleVerseMarkDto {
  // Mesma regra de create-bible-verse-mark.dto.ts: espaço em branco puro
  // não conta como conteúdo (spec.md, Edge Cases).
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'O comentário precisa ter ao menos 3 caracteres' })
  @MaxLength(2000, { message: 'O comentário não pode passar de 2000 caracteres' })
  comment!: string;
}
