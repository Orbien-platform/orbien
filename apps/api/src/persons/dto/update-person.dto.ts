import { PartialType } from '@nestjs/mapped-types';
import { IsDate, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePersonDto } from './create-person.dto';

export class UpdatePersonDto extends PartialType(CreatePersonDto) {
  // Override: membership_date is always optional on PATCH because it may already
  // exist in the DB. The @ValidateIf from CreatePersonDto would incorrectly reject
  // requests that include classification:'member' but omit the date.
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Data de membresia inválida' })
  override membership_date?: Date;
}
