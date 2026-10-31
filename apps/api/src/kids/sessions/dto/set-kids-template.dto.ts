import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetKidsTemplateDto {
  // Lista vazia limpa o modelo: a celebração volta a não ter culto kids padrão.
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  room_ids!: string[];
}
