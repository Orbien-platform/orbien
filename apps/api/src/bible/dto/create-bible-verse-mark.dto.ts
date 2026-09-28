import { Transform } from 'class-transformer';
import { IsInt, IsString, Min, MaxLength, MinLength } from 'class-validator';

/**
 * Marcação de um intervalo contíguo de versículos (biblia-nvi-marcacoes-mobile,
 * BIB-04/BIB-05). `book_code`/`chapter` são validados contra a lista
 * canônica no service (`BibleVerseMarksService`, via `BibleReaderService`),
 * não aqui — o DTO só garante forma, não existência.
 *
 * Limite de `comment` (3–2000) é o mesmo de `CreatePrayerRequestDto`: conteúdo
 * reflexivo de forma livre, não chat curto.
 */
export class CreateBibleVerseMarkDto {
  @IsString()
  book_code!: string;

  @IsInt()
  @Min(1)
  chapter!: number;

  @IsInt()
  @Min(1)
  verse_start!: number;

  @IsInt()
  @Min(1)
  verse_end!: number;

  // Espaço em branco puro não conta como conteúdo (spec.md, Edge Cases) — o
  // trim roda antes do MinLength, então '   ' vira '' e cai na mesma
  // rejeição de comentário ausente/curto demais.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'O comentário precisa ter ao menos 3 caracteres' })
  @MaxLength(2000, { message: 'O comentário não pode passar de 2000 caracteres' })
  comment!: string;
}
