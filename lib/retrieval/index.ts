import { DocumentChunk } from '@/types/document';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as',
  'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'could',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves'
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export interface ScoredChunk {
  chunk: DocumentChunk;
  score: number;
}

export class InMemoryRetrievalIndex {
  private chunks: DocumentChunk[];
  private chunkVectors: Map<string, Map<string, number>>;
  private idf: Map<string, number>;

  constructor(chunks: DocumentChunk[]) {
    this.chunks = chunks;
    this.chunkVectors = new Map();
    this.idf = new Map();
    this.buildIndex();
  }

  private buildIndex() {
    const docCount = this.chunks.length;
    if (docCount === 0) return;

    const termDocFreq = new Map<string, number>();

    // 1. Calculate term frequencies per chunk
    for (const chunk of this.chunks) {
      // Include section title multiple times for weighting
      const titleTokens = tokenize(chunk.sectionTitle);
      const textTokens = tokenize(chunk.text);
      const combinedTokens = [...titleTokens, ...titleTokens, ...textTokens];

      const tfMap = new Map<string, number>();
      for (const t of combinedTokens) {
        tfMap.set(t, (tfMap.get(t) || 0) + 1);
      }

      for (const term of tfMap.keys()) {
        termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
      }

      this.chunkVectors.set(chunk.chunkId, tfMap);
    }

    // 2. Compute IDF: log(1 + (N - df + 0.5) / (df + 0.5))
    for (const [term, df] of termDocFreq.entries()) {
      const idfValue = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
      this.idf.set(term, idfValue);
    }

    // 3. Normalize TF-IDF vectors
    for (const [chunkId, tfMap] of this.chunkVectors.entries()) {
      let normSq = 0;
      for (const [term, tf] of tfMap.entries()) {
        const idfVal = this.idf.get(term) || 1.0;
        const weight = (1 + Math.log(tf)) * idfVal;
        tfMap.set(term, weight);
        normSq += weight * weight;
      }
      const norm = Math.sqrt(normSq) || 1.0;
      for (const [term, weight] of tfMap.entries()) {
        tfMap.set(term, weight / norm);
      }
    }
  }

  /**
   * Searches for the top-k most relevant chunks using cosine similarity
   */
  public search(query: string, topK: number = 4): ScoredChunk[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.chunks.length === 0) {
      return this.chunks.slice(0, topK).map((chunk) => ({ chunk, score: 0 }));
    }

    // Build query vector
    const queryTf = new Map<string, number>();
    for (const t of queryTokens) {
      queryTf.set(t, (queryTf.get(t) || 0) + 1);
    }

    let qNormSq = 0;
    const queryWeights = new Map<string, number>();
    for (const [term, tf] of queryTf.entries()) {
      const idfVal = this.idf.get(term) || 1.0;
      const weight = (1 + Math.log(tf)) * idfVal;
      queryWeights.set(term, weight);
      qNormSq += weight * weight;
    }
    const qNorm = Math.sqrt(qNormSq) || 1.0;
    for (const [term, weight] of queryWeights.entries()) {
      queryWeights.set(term, weight / qNorm);
    }

    // Calculate Cosine Similarity with all chunks
    const results: ScoredChunk[] = [];
    for (const chunk of this.chunks) {
      const docVector = this.chunkVectors.get(chunk.chunkId);
      if (!docVector) continue;

      let dotProduct = 0;
      for (const [term, qWeight] of queryWeights.entries()) {
        const dWeight = docVector.get(term);
        if (dWeight) {
          dotProduct += qWeight * dWeight;
        }
      }

      // Title keyword boost: if the query explicitly mentions words from the section title
      const titleLower = chunk.sectionTitle.toLowerCase();
      let titleBonus = 0;
      for (const qWord of queryTokens) {
        if (titleLower.includes(qWord)) {
          titleBonus += 0.15;
        }
      }

      const finalScore = dotProduct + titleBonus;
      results.push({ chunk, score: finalScore });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
