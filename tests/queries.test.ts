import { describe, it, expect } from 'vitest';
import { SEARCH_QUERIES } from '../src/queries.js';

describe('SEARCH_QUERIES', () => {
  it('should contain exactly 16 queries', () => {
    expect(SEARCH_QUERIES).toHaveLength(16);
  });

  it('should have non-empty query strings', () => {
    for (const config of SEARCH_QUERIES) {
      expect(config.query.length, `query "${config.query}" should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('should have unique queries (no duplicates)', () => {
    const queries = SEARCH_QUERIES.map((c) => c.query);
    const uniqueQueries = new Set(queries);
    expect(uniqueQueries.size).toBe(queries.length);
  });

  it('should have perPage values between 1 and 100', () => {
    for (const config of SEARCH_QUERIES) {
      expect(config.perPage, `perPage for "${config.query}" should be 1-100`).toBeGreaterThanOrEqual(1);
      expect(config.perPage, `perPage for "${config.query}" should be 1-100`).toBeLessThanOrEqual(100);
    }
  });

  it('should have valid sort values', () => {
    const validSorts = ['stars', 'updated'];
    for (const config of SEARCH_QUERIES) {
      expect(validSorts, `sort "${config.sort}" for "${config.query}" should be valid`).toContain(config.sort);
    }
  });
});
