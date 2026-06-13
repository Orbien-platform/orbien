import { IsIn } from 'class-validator';
import { ExportRequestDto } from './export-request.dto';

export class PdfExportRequestDto extends ExportRequestDto {
  @IsIn(['razao', 'diario'])
  type!: 'razao' | 'diario';
}
