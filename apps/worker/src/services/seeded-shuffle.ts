/**
 * Seeded shuffle implementation using Mulberry32 PRNG
 * Provides deterministic shuffling based on a string seed
 */

/**
 * Mulberry32 PRNG - a fast, high-quality 32-bit PRNG
 * @param seed - 32-bit integer seed
 * @returns Function that returns next random number in [0, 1)
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert a string to a 32-bit hash for seeding the PRNG
 * Uses djb2 algorithm for consistent hashing
 * @param str - String to hash
 * @returns 32-bit integer hash
 */
function stringToSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Fisher-Yates shuffle with seeded randomness
 * Same seed always produces same shuffle order
 * @param array - Array to shuffle (not modified)
 * @param seed - String seed for deterministic randomness
 * @returns New shuffled array
 */
export function seededShuffle<T>(array: T[], seed: string): T[] {
  const result = [...array];
  const random = mulberry32(stringToSeed(seed));

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Get the shuffled indices for an array given a seed
 * Useful for tracking original positions after shuffle
 * @param length - Length of array
 * @param seed - String seed for deterministic randomness
 * @returns Array of original indices in shuffled order
 */
export function getShuffledIndices(length: number, seed: string): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  return seededShuffle(indices, seed);
}
