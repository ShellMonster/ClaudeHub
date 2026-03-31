import { describe, it, expect, vi } from 'vitest';
import {
  mergeResults,
  parseNavigationData,
  createFreshData,
  safeMerge,
} from '../src/update.js';
import type { NavItem, NavigationData } from '../src/types.js';

function makeNavItem(overrides: Partial<NavItem> & { id: string }): NavItem {
  return {
    name: overrides.name ?? 'test-repo',
    owner: overrides.owner ?? 'test-owner',
    url: overrides.url ?? `https://github.com/test-owner/${overrides.name ?? 'test-repo'}`,
    description: overrides.description ?? 'A test repo',
    summary: overrides.summary ?? 'Test summary',
    tags: overrides.tags ?? ['test'],
    stars: overrides.stars ?? 100,
    forks: overrides.forks ?? 10,
    updated_at: overrides.updated_at ?? '2025-01-01T00:00:00Z',
    content_type: overrides.content_type ?? 'code',
    score: overrides.score ?? 3,
    new: overrides.new ?? false,
    mirror_risk: overrides.mirror_risk ?? false,
    original_analysis_likelihood: overrides.original_analysis_likelihood ?? 'medium',
    ...overrides,
  };
}

function makeExistingData(items: NavItem[], categoryKey = 'other' as const): NavigationData {
  return {
    generated_at: '2025-01-01T00:00:00Z',
    source: 'github',
    schema_version: '1.0.0',
    categories: [
      {
        key: categoryKey,
        label: categoryKey === 'other' ? '其他' : '源码分析',
        items,
      },
    ],
  };
}

describe('mergeResults', () => {
  it('should add new repos with new: true', () => {
    const existing = makeExistingData([
      makeNavItem({ id: 'owner_existing-repo' }),
    ]);

    const newItems = [
      makeNavItem({ id: 'owner_existing-repo' }),
      makeNavItem({ id: 'owner_brand-new-repo', name: 'brand-new-repo' }),
    ];

    const result = mergeResults(existing, newItems);

    const allItems = result.categories.flatMap((c) => c.items);
    const existingRepo = allItems.find((i) => i.id === 'owner_existing-repo');
    const newRepo = allItems.find((i) => i.id === 'owner_brand-new-repo');

    expect(existingRepo?.new).toBe(false);
    expect(newRepo?.new).toBe(true);
    expect(newRepo?.unavailable).toBe(false);
  });

  it('should update metadata for existing repos', () => {
    const existing = makeExistingData([
      makeNavItem({
        id: 'owner_repo',
        stars: 100,
        updated_at: '2025-01-01T00:00:00Z',
        description: 'Old description',
      }),
    ]);

    const newItems = [
      makeNavItem({
        id: 'owner_repo',
        stars: 500,
        updated_at: '2025-06-01T00:00:00Z',
        description: 'New description',
      }),
    ];

    const result = mergeResults(existing, newItems);
    const repo = result.categories[0].items[0];

    expect(repo.stars).toBe(500);
    expect(repo.updated_at).toBe('2025-06-01T00:00:00Z');
    expect(repo.description).toBe('New description');
    expect(repo.new).toBe(false);
    expect(repo.unavailable).toBe(false);
  });

  it('should flag unavailable repos but not remove them', () => {
    const existing = makeExistingData([
      makeNavItem({ id: 'owner_repo-a' }),
      makeNavItem({ id: 'owner_repo-b' }),
    ]);

    const newItems = [makeNavItem({ id: 'owner_repo-a' })];

    const result = mergeResults(existing, newItems);
    const allItems = result.categories[0].items;

    const repoA = allItems.find((i) => i.id === 'owner_repo-a');
    const repoB = allItems.find((i) => i.id === 'owner_repo-b');

    expect(repoA?.unavailable).toBe(false);
    expect(repoB?.unavailable).toBe(true);
    expect(allItems).toHaveLength(2);
  });

  it('should handle renamed repos (same id, different name/owner)', () => {
    const existing = makeExistingData([
      makeNavItem({
        id: '12345',
        name: 'old-name',
        owner: 'old-owner',
        url: 'https://github.com/old-owner/old-name',
      }),
    ]);

    const newItems = [
      makeNavItem({
        id: '12345',
        name: 'new-name',
        owner: 'new-owner',
        url: 'https://github.com/new-owner/new-name',
      }),
    ];

    const result = mergeResults(existing, newItems);
    const repo = result.categories[0].items[0];

    expect(repo.id).toBe('12345');
    expect(repo.name).toBe('new-name');
    expect(repo.owner).toBe('new-owner');
    expect(repo.url).toBe('https://github.com/new-owner/new-name');
    expect(repo.new).toBe(false);
  });

  it('should clear unavailable flag when repo reappears', () => {
    const existing = makeExistingData([
      makeNavItem({ id: 'owner_repo', unavailable: true }),
    ]);

    const newItems = [makeNavItem({ id: 'owner_repo' })];

    const result = mergeResults(existing, newItems);
    const repo = result.categories[0].items[0];

    expect(repo.unavailable).toBe(false);
  });

  it('should preserve source and schema_version from existing', () => {
    const existing = makeExistingData([]);
    existing.schema_version = '2.0.0';

    const result = mergeResults(existing, []);

    expect(result.source).toBe('github');
    expect(result.schema_version).toBe('2.0.0');
  });

  it('should update generated_at timestamp', () => {
    const existing = makeExistingData([]);
    existing.generated_at = '2020-01-01T00:00:00Z';

    const result = mergeResults(existing, []);

    expect(result.generated_at).not.toBe('2020-01-01T00:00:00Z');
  });

  it('should handle empty existing data with new items', () => {
    const existing = makeExistingData([]);
    const newItems = [
      makeNavItem({ id: 'owner_new-repo' }),
    ];

    const result = mergeResults(existing, newItems);
    const allItems = result.categories.flatMap((c) => c.items);

    expect(allItems).toHaveLength(1);
    expect(allItems[0].new).toBe(true);
  });

  it('should handle completely empty inputs', () => {
    const existing = makeExistingData([]);
    const result = mergeResults(existing, []);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].items).toHaveLength(0);
  });
});

describe('parseNavigationData', () => {
  it('should parse valid JSON', () => {
    const json = JSON.stringify({
      generated_at: '2025-01-01T00:00:00Z',
      source: 'github',
      schema_version: '1.0.0',
      categories: [],
    });

    const result = parseNavigationData(json);
    expect(result).not.toBeNull();
    expect(result?.generated_at).toBe('2025-01-01T00:00:00Z');
  });

  it('should return null for malformed JSON', () => {
    expect(parseNavigationData('{invalid json')).toBeNull();
  });

  it('should return null for valid JSON with wrong structure', () => {
    expect(parseNavigationData('{"foo": "bar"}')).toBeNull();
  });

  it('should return null for non-string input parsed as wrong type', () => {
    expect(parseNavigationData('null')).toBeNull();
    expect(parseNavigationData('"hello"')).toBeNull();
    expect(parseNavigationData('42')).toBeNull();
  });
});

describe('createFreshData', () => {
  it('should return empty NavigationData', () => {
    const data = createFreshData();

    expect(data.source).toBe('github');
    expect(data.schema_version).toBe('1.0.0');
    expect(data.categories).toHaveLength(0);
    expect(data.generated_at).toBeTruthy();
  });
});

describe('safeMerge', () => {
  it('should merge when JSON is valid', () => {
    const existingJson = JSON.stringify(makeExistingData([
      makeNavItem({ id: 'owner_repo', stars: 100 }),
    ]));

    const newItems = [
      makeNavItem({ id: 'owner_repo', stars: 200 }),
    ];

    const result = safeMerge(existingJson, newItems);
    const repo = result.categories[0].items[0];

    expect(repo.stars).toBe(200);
  });

  it('should return fresh data for malformed JSON', () => {
    const backupFn = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = safeMerge('{broken json', [], backupFn);

    expect(result.categories).toHaveLength(0);
    expect(result.source).toBe('github');
    expect(backupFn).toHaveBeenCalledWith('{broken json');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should call backupFn even if it throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingBackup = vi.fn(() => {
      throw new Error('disk full');
    });

    const result = safeMerge('not json', [], failingBackup);

    expect(result.categories).toHaveLength(0);
    expect(failingBackup).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
  });

  it('should work without backupFn', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = safeMerge('not json', []);

    expect(result.categories).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
