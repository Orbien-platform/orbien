import { IsUUID } from 'class-validator';

export class ImpersonateDto {
  @IsUUID()
  target_tenant_id!: string;
}
