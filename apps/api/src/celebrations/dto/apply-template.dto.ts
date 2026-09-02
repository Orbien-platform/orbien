import { IsUUID } from 'class-validator';

export class ApplyTemplateDto {
  @IsUUID()
  template_id!: string;
}
