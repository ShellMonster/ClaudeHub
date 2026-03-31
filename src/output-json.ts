import type { CategorySection, NavigationData } from './types.js';

/** 将分类数据转换为 NavigationData，items 按 score 降序排列 */
export function generateJson(categories: CategorySection[]): NavigationData {
  const sortedCategories = categories.map((category) => ({
    ...category,
    items: [...category.items].sort((a, b) => b.score - a.score),
  }));

  return {
    generated_at: new Date().toISOString(),
    source: 'github',
    schema_version: '1.0.0',
    categories: sortedCategories,
  };
}

export function stringifyJson(data: NavigationData): string {
  return JSON.stringify(data, null, 2);
}
