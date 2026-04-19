export interface DimensionResult {
  id: string;
  label: string;
  score: number;
  total: number;
  percent: number;
  weight: number;
  recommendations: string[];
}

export interface ScoreResult {
  overall: number;
  dimensions: DimensionResult[];
}
