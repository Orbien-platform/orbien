import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateGroupMessageDto {
  // Mensagem de chat é curta por natureza; 1 caractere já é mensagem ("?"),
  // diferente do pedido de oração, que exige 3. O teto é menor pelo mesmo
  // motivo: 2000 caracteres numa conversa é texto colado, não conversa.
  // Apara ANTES de validar, não só na hora de gravar: sem isso `"   "` passa
  // pelo `@MinLength(1)` e o service grava string vazia — uma bolha que não é
  // mensagem nem lápide.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'A mensagem não pode ser vazia' })
  @MaxLength(1000, { message: 'A mensagem não pode passar de 1000 caracteres' })
  content!: string;
}
