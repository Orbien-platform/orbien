import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, Matches } from 'class-validator';

/** Datas civis (`YYYY-MM-DD`) de ocorrências a cancelar — uma por culto. */
export class CancelInstanceDatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ArrayUnique()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true, message: 'cada data deve estar no formato AAAA-MM-DD' })
  dates!: string[];
}
