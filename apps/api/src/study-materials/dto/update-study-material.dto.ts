import { PartialType } from '@nestjs/mapped-types';
import { CreateStudyMaterialDto } from './create-study-material.dto';

export class UpdateStudyMaterialDto extends PartialType(CreateStudyMaterialDto) {}
