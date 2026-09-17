import { beforeEach } from 'vitest';
import { sessionAnalysisCache } from '@/lib/cache/analysisCache';

beforeEach(() => {
  sessionAnalysisCache.clear();
});
