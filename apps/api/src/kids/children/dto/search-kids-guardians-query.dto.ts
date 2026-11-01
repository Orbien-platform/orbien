import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchKidsGuardiansQueryDto {
  // Nome ou telefone. Mínimo de 2 caracteres: busca de 1 letra devolveria a
  // congregação inteira.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}
