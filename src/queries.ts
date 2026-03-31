import type { SearchConfig } from './types.js';

/**
 * 搜索查询配置数组
 * 包含 16 个用于搜索 Claude Code 相关 GitHub 仓库的查询模式
 */
export const SEARCH_QUERIES: SearchConfig[] = [
  { query: 'Claude Code', sort: 'stars', perPage: 100 },
  { query: 'Claude Code analysis', sort: 'stars', perPage: 100 },
  { query: 'Claude Code reverse engineering', sort: 'stars', perPage: 100 },
  { query: 'Claude Code architecture', sort: 'stars', perPage: 100 },
  { query: 'Claude Code deep dive', sort: 'stars', perPage: 100 },
  { query: 'Claude Code tutorial', sort: 'stars', perPage: 100 },
  { query: 'Claude Code implementation', sort: 'stars', perPage: 100 },
  { query: 'awesome claude code', sort: 'stars', perPage: 100 },
  { query: 'claude code plugin', sort: 'stars', perPage: 100 },
  { query: 'claude code skills hooks', sort: 'stars', perPage: 100 },
  { query: 'claude code security', sort: 'stars', perPage: 100 },
  { query: 'claude code best practices', sort: 'stars', perPage: 100 },
  { query: 'claude code context engineering', sort: 'stars', perPage: 100 },
  { query: 'openclaw claude code', sort: 'stars', perPage: 100 },
  { query: 'claude code source code analysis', sort: 'stars', perPage: 100 },
  { query: 'learn claude code', sort: 'stars', perPage: 100 },
];
