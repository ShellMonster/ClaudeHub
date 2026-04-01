import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LABELS,
  isCategoryKey,
  isLikelihood,
  isNavItem,
  isGitHubRepo,
} from '../src/types.js';
import type { CategoryKey, NavItem, GitHubRepo } from '../src/types.js';

describe('CATEGORY_LABELS', () => {
  it('should have exactly 11 categories', () => {
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(11);
  });

  it('should map every CategoryKey to a non-empty string', () => {
    const keys: CategoryKey[] = [
      'source_analysis', 'reverse_engineering', 'tutorial',
      'skill_plugin', 'tooling', 'security', 'awesome_list',
      'book_or_longform', 'reimplementation', 'discussion_archive', 'other',
    ];
    for (const key of keys) {
      expect(CATEGORY_LABELS[key].length).toBeGreaterThan(0);
    }
  });
});

describe('isCategoryKey', () => {
  it('should return true for valid category keys', () => {
    expect(isCategoryKey('source_analysis')).toBe(true);
    expect(isCategoryKey('tutorial')).toBe(true);
    expect(isCategoryKey('other')).toBe(true);
    expect(isCategoryKey('reverse_engineering')).toBe(true);
    expect(isCategoryKey('skill_plugin')).toBe(true);
  });

  it('should return false for invalid strings', () => {
    expect(isCategoryKey('invalid')).toBe(false);
    expect(isCategoryKey('')).toBe(false);
    expect(isCategoryKey('analysis')).toBe(false); // 旧分类名，已废弃
  });
});

describe('isLikelihood', () => {
  it('should return true for valid likelihood values', () => {
    expect(isLikelihood('high')).toBe(true);
    expect(isLikelihood('medium')).toBe(true);
    expect(isLikelihood('low')).toBe(true);
  });

  it('should return false for invalid values', () => {
    expect(isLikelihood('invalid')).toBe(false);
    expect(isLikelihood('')).toBe(false);
  });
});

describe('isNavItem', () => {
  const validNavItem: NavItem = {
    id: 'owner_repo',
    name: 'repo',
    owner: 'owner',
    url: 'https://github.com/owner/repo',
    description: 'A test repo',
    summary: 'Test summary',
    tags: ['test'],
    stars: 100,
    forks: 10,
    updated_at: '2025-01-01T00:00:00Z',
    content_type: 'code',
    score: 3,
    new: false,
    mirror_risk: false,
    original_analysis_likelihood: 'high',
  };

  it('should return true for a valid NavItem', () => {
    expect(isNavItem(validNavItem)).toBe(true);
  });

  it('should return true for NavItem with optional unavailable field', () => {
    expect(isNavItem({ ...validNavItem, unavailable: true })).toBe(true);
  });

  it('should return false for null', () => {
    expect(isNavItem(null)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isNavItem('string')).toBe(false);
    expect(isNavItem(42)).toBe(false);
  });

  it('should return false when missing required fields', () => {
    const { name, ...missing } = validNavItem;
    expect(isNavItem(missing)).toBe(false);
  });

  it('should return false for wrong field types', () => {
    expect(isNavItem({ ...validNavItem, stars: '100' })).toBe(false);
    expect(isNavItem({ ...validNavItem, new: 'yes' })).toBe(false);
  });
});

describe('isGitHubRepo', () => {
  const validRepo: GitHubRepo = {
    id: 12345,
    full_name: 'owner/repo',
    name: 'repo',
    owner: { login: 'owner' },
    html_url: 'https://github.com/owner/repo',
    description: 'A test repo',
    stargazers_count: 100,
    forks_count: 10,
    updated_at: '2025-01-01T00:00:00Z',
    language: 'TypeScript',
    topics: ['cli'],
    archived: false,
    fork: false,
  };

  it('should return true for a valid GitHubRepo', () => {
    expect(isGitHubRepo(validRepo)).toBe(true);
  });

  it('should return true when description is null', () => {
    expect(isGitHubRepo({ ...validRepo, description: null })).toBe(true);
  });

  it('should return true when language is null', () => {
    expect(isGitHubRepo({ ...validRepo, language: null })).toBe(true);
  });

  it('should return false for null', () => {
    expect(isGitHubRepo(null)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isGitHubRepo('string')).toBe(false);
  });

  it('should return false when missing required fields', () => {
    const { full_name, ...missing } = validRepo;
    expect(isGitHubRepo(missing)).toBe(false);
  });
});
