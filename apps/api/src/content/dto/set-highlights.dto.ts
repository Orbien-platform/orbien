import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { MAX_APP_HIGHLIGHTS } from '../posts.service';

export class SetHighlightsDto {
  /** Na ordem em que aparecem no app. Lista vazia tira todos do destaque. */
  @IsArray()
  @ArrayMaxSize(MAX_APP_HIGHLIGHTS)
  @IsUUID('all', { each: true })
  post_ids!: string[];
}
