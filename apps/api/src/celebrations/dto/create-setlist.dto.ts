import { IsUUID } from 'class-validator';

export class CreateSetlistDto {
  @IsUUID()
  service_order_item_id!: string;
}
