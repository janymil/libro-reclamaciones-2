import type { Complaint } from "@shared/schema";
import { getAIClient, recordEmbeddingUsage, type AIUsageContext } from "./aiService";

/**
 * Similar-complaint detection.
 *
 * Two modes:
 * 1. If AI_EMBEDDINGS_MODEL is configured (any OpenAI-compatible
 *    /embeddings endpoint - e.g. Ollama, OpenRouter, DeepSeek), complaints
 *    are compared using real embedding vectors.
 * 2. Otherwise - the default, since Groq has no embeddings endpoint - a
 *    local TF-IDF vectorization + cosine similarity is used. Zero external
 *    calls, deterministic, and effective for Spanish complaint matching.
 */

const SIMILARITY_THRESHOLD = 0.2;

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'en', 'con', 'por', 'para', 'que',
  'del', 'al', 'se', 'lo', 'su', 'sus', 'mi', 'mis', 'me', 'te', 'le', 'les', 'es', 'está',
  'estoy', 'fue', 'era', 'muy', 'más', 'pero', 'como', 'sobre', 'desde', 'hasta', 'cuando',
  'donde', 'este', 'esta', 'eso', 'esa', 'hay', 'han', 'ha', 'he', 'fui', 'ser', 'tener',
  'tengo', 'hice', 'hizo', 'día', 'días', 'semana', 'semanas', 'todo', 'toda', 'todos',
  'todas', 'otro', 'otra', 'si', 'no', 'ni', 'también', 'porque', 'the', 'and',
]);

function tokenize(text: string): string[] {
  return (text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+/g) ?? [])
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function complaintText(complaint: Complaint): string {
  return [complaint.productServiceName, complaint.complaintDetail, complaint.consumerRequest]
    .filter((part): part is string => Boolean(part))
    .join('. ');
}

/** Sparse TF-IDF vectors: one map of term -> weight per document. */
function tfidfVectors(texts: string[]): Array<Map<string, number>> {
  const tokenized = texts.map(tokenize);
  const documentFrequency = new Map<string, number>();

  for (const tokens of tokenized) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return tokenized.map((tokens) => {
    const vector = new Map<string, number>();
    if (tokens.length === 0) return vector;

    const termCounts = new Map<string, number>();
    for (const term of tokens) {
      termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
    }

    for (const [term, count] of termCounts) {
      const tf = count / tokens.length;
      const idf = Math.log(1 + texts.length / (documentFrequency.get(term) ?? 1));
      vector.set(term, tf * idf);
    }
    return vector;
  });
}

function cosineSparse(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const value of a.values()) normA += value * value;
  for (const value of b.values()) normB += value * value;
  if (normA === 0 || normB === 0) return 0;

  for (const [term, value] of a) {
    const other = b.get(term);
    if (other) dot += value * other;
  }

  return dot / Math.sqrt(normA * normB);
}

function cosineDense(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

/** Uses the provider's /embeddings endpoint when AI_EMBEDDINGS_MODEL is set. */
async function embedTexts(
  texts: string[],
  usage?: AIUsageContext,
): Promise<number[][] | null> {
  const model = process.env.AI_EMBEDDINGS_MODEL;
  const ai = getAIClient();
  if (!model || !ai) return null;

  try {
    const response = await ai.embeddings.create({ model, input: texts });
    recordEmbeddingUsage(
      response.usage,
      { model, provider: `primary:${process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1'}` },
      usage,
    );
    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.error('Embeddings request failed, falling back to local TF-IDF:', error);
    return null;
  }
}

export interface SimilarComplaintMatch {
  complaintId: string;
  correlativeNumber: string;
  complaintType: string;
  status: string;
  priority: string;
  similarity: number;
  complaintDetail: string;
  providerResponse: string | null;
  submissionDate: Date;
}

export const similarityService = {
  /**
   * Returns the most similar past complaints of the same business, richest
   * first (resolved complaints with a sent response can be reused as-is).
   */
  async findSimilarComplaints(
    target: Complaint,
    candidates: Complaint[],
    limit = 5,
    usage?: AIUsageContext,
  ): Promise<SimilarComplaintMatch[]> {
    const pool = candidates.filter(
      (complaint) => complaint.id !== target.id && Boolean(complaint.complaintDetail)
    );
    if (pool.length === 0 || !target.complaintDetail) return [];

    const texts = [complaintText(target), ...pool.map(complaintText)];

    const embeddings = await embedTexts(texts, usage);
    let scores: number[];
    if (embeddings) {
      const [targetVector, ...rest] = embeddings;
      scores = rest.map((vector) => cosineDense(targetVector, vector));
    } else {
      const vectors = tfidfVectors(texts);
      const [targetVector, ...rest] = vectors;
      scores = rest.map((vector) => cosineSparse(targetVector, vector));
    }

    const resolvedBonus = (complaint: Complaint): number =>
      complaint.status === 'resolved' && complaint.providerResponse ? 0.01 : 0;

    return pool
      .map((complaint, index) => ({ complaint, similarity: Math.round(scores[index] * 100) / 100 }))
      .filter((match) => match.similarity >= SIMILARITY_THRESHOLD)
      .sort(
        (a, b) =>
          b.similarity + resolvedBonus(b.complaint) - (a.similarity + resolvedBonus(a.complaint))
      )
      .slice(0, limit)
      .map(({ complaint, similarity }) => ({
        complaintId: complaint.id,
        correlativeNumber: complaint.correlativeNumber,
        complaintType: complaint.complaintType,
        status: complaint.status,
        priority: complaint.priority,
        similarity,
        complaintDetail: complaint.complaintDetail.slice(0, 400),
        providerResponse: complaint.providerResponse,
        submissionDate: complaint.submissionDate,
      }));
  },
};

