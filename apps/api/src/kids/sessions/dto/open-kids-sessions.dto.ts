import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class OpenKidsSessionsDto {
  // Uma sessão por turma. Turma repetida no mesmo corpo é erro de quem chama.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  room_ids!: string[];
}
