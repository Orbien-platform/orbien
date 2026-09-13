import { IsUUID } from 'class-validator';

export class TransferUserAccountDto {
  @IsUUID()
  destination_tenant_id!: string;

  @IsUUID()
  destination_congregation_id!: string;
}
