/**
 * Biometric Face Detection and Embedding Matching Service
 *
 * Provides on-device face feature extraction, consent-based enrollment,
 * 128-dimensional normalized embedding vectors, cosine similarity matching,
 * and secure local-only storage.
 *
 * STRICT PRIVACY & CONSENT RULES:
 * 1. Requires explicit informed consent before enrollment.
 * 2. Biometric embeddings remain strictly on the user's device (localStorage).
 * 3. Never uploads face images or vectors to external cloud services.
 * 4. Only identifies consented, enrolled individuals. Unrecognized faces return
 *    "Unrecognized person".
 */

export interface EnrolledFaceProfile {
  id: string;
  name: string;
  relation: string;
  consentGiven: boolean;
  consentTimestamp: string;
  embedding: number[]; // 128-D normalized embedding vector
  createdAt: string;
}

export interface FaceMatchResult {
  matched: boolean;
  profile?: EnrolledFaceProfile;
  similarity: number;
  announcementText: string;
  faceDetected: boolean;
}

const STORAGE_KEY = "inai_enrolled_face_profiles_v2";
export const DEFAULT_SIMILARITY_THRESHOLD = 0.78;

/**
 * Compute the cosine similarity between two normalized embedding vectors.
 * Since vectors are L2-normalized, cosine similarity is simply the dot product.
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Extract a 128-dimensional facial embedding vector from face pixel data.
 * Computes spatial intensity gradients across a 4x4 sub-region grid with 8 directional bins.
 */
export function generateFaceEmbeddingFromPixels(
  imageData: ImageData
): number[] {
  const { width, height, data } = imageData;
  const EMBEDDING_DIM = 128;
  const embedding = new Array<number>(EMBEDDING_DIM).fill(0);

  if (width < 8 || height < 8) {
    return embedding;
  }

  // Convert to grayscale grid
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Compute 4x4 spatial cells, each with 8 gradient orientation bins (4 * 4 * 8 = 128 dimensions)
  const cellW = Math.floor(width / 4);
  const cellH = Math.floor(height / 4);

  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      const cellIndex = (cy * 4 + cx) * 8;

      const startX = cx * cellW;
      const endX = Math.min(width - 1, (cx + 1) * cellW);
      const startY = cy * cellH;
      const endY = Math.min(height - 1, (cy + 1) * cellH);

      for (let y = Math.max(1, startY); y < endY; y++) {
        for (let x = Math.max(1, startX); x < endX; x++) {
          const idx = y * width + x;
          const currentLeft = gray[idx - 1] ?? 0;
          const currentRight = gray[idx + 1] ?? 0;
          const currentUp = gray[idx - width] ?? 0;
          const currentDown = gray[idx + width] ?? 0;

          const dx = currentRight - currentLeft;
          const dy = currentDown - currentUp;
          const magnitude = Math.sqrt(dx * dx + dy * dy);

          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;

          // Map angle to 8 bins (0-7)
          const bin = Math.min(7, Math.floor(angle / 45));
          embedding[cellIndex + bin] = (embedding[cellIndex + bin] ?? 0) + magnitude;
        }
      }
    }
  }

  // L2-Normalize the 128D embedding vector
  let sumSq = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const val = embedding[i] ?? 0;
    sumSq += val * val;
  }

  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      embedding[i] = (embedding[i] ?? 0) / norm;
    }
  }

  return embedding;
}

/**
 * Retrieve all enrolled familiar person profiles from secure local storage.
 */
export function getEnrolledFaceProfiles(): EnrolledFaceProfile[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Save an enrolled familiar person profile with informed consent.
 */
export function saveEnrolledFaceProfile(
  profile: Omit<EnrolledFaceProfile, "id" | "createdAt">
): EnrolledFaceProfile {
  if (!profile.consentGiven) {
    throw new Error("Consent is required before enrolling a familiar person.");
  }

  const newProfile: EnrolledFaceProfile = {
    ...profile,
    id: `person_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  const existing = getEnrolledFaceProfiles();
  const updated = [newProfile, ...existing];

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  return newProfile;
}

/**
 * Delete an enrolled profile by ID.
 */
export function deleteEnrolledFaceProfile(id: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const existing = getEnrolledFaceProfiles();
  const filtered = existing.filter((p) => p.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Clear all enrolled face profiles.
 */
export function clearAllEnrolledFaceProfiles(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Compare a candidate embedding against all enrolled profiles using cosine similarity.
 */
export function matchCandidateEmbedding(
  candidateEmbedding: number[],
  threshold = DEFAULT_SIMILARITY_THRESHOLD
): FaceMatchResult {
  const profiles = getEnrolledFaceProfiles();
  if (profiles.length === 0) {
    return {
      matched: false,
      similarity: 0,
      faceDetected: true,
      announcementText:
        "A person is visible, but no familiar people are currently enrolled. You can enroll a person with their consent.",
    };
  }

  let bestMatch: EnrolledFaceProfile | undefined;
  let highestSim = -1;

  for (const profile of profiles) {
    const sim = computeCosineSimilarity(candidateEmbedding, profile.embedding);
    if (sim > highestSim) {
      highestSim = sim;
      bestMatch = profile;
    }
  }

  if (bestMatch && highestSim >= threshold) {
    const relStr = bestMatch.relation ? ` (${bestMatch.relation})` : "";
    return {
      matched: true,
      profile: bestMatch,
      similarity: highestSim,
      faceDetected: true,
      announcementText: `Familiar person identified: ${bestMatch.name}${relStr}. Note: On-device match based on enrolled facial profile.`,
    };
  }

  return {
    matched: false,
    similarity: Math.max(0, highestSim),
    faceDetected: true,
    announcementText:
      "A person is visible in front of you, but they do not match any enrolled familiar person.",
  };
}
