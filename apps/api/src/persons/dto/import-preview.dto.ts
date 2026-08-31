export interface SuggestedMapping {
  nome?: string;
  telefone?: string;
  email?: string;
  sexo?: string;
  birth_date?: string;
  classificação?: string;
}

export interface ImportPreviewDto {
  file_id: string;
  total_rows: number;
  preview_rows: Record<string, string>[];
  detected_columns: string[];
  suggested_mapping: SuggestedMapping;
}
