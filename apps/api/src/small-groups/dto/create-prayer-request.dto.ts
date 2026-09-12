import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePrayerRequestDto {
  @IsString()
  @MinLength(3, { message: 'O pedido precisa ter ao menos 3 caracteres' })
  @MaxLength(2000, { message: 'O pedido não pode passar de 2000 caracteres' })
  content!: string;

  // Anônimo esconde o autor dos outros membros, não do banco: `person_id`
  // continua gravado, senão a retenção da seção 5 (LGPD) não teria a quem
  // vincular a linha, e o próprio autor não conseguiria apagar o que escreveu.
  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;
}
