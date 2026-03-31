import type { CategorySection, NavItem, NavigationData } from './types.js';

/**
 * 将新扫描到的仓库列表与已有数据合并，实现增量更新。
 *
 * 1. 新仓库 → 添加到对应分类，标记 new: true
 * 2. 已有仓库 → 更新元数据（stars、updated_at 等），保持 new: false
 * 3. 已有但本次未出现的仓库 → 标记 unavailable: true（不删除）
 * 4. 重命名仓库（id 不变但 full_name 变了）→ 更新 name/owner/url
 * 5. 畸形 JSON → 记录错误、备份旧文件、返回全新数据
 */
export function mergeResults(
  existing: NavigationData,
  newItems: NavItem[],
): NavigationData {
  const existingMap = new Map<string, NavItem>();
  for (const category of existing.categories) {
    for (const item of category.items) {
      existingMap.set(item.id, item);
    }
  }

  const newMap = new Map<string, NavItem>();
  for (const item of newItems) {
    newMap.set(item.id, item);
  }

  const processedIds = new Set<string>();
  const updatedCategories: CategorySection[] = existing.categories.map(
    (section) => {
      const updatedItems: NavItem[] = [];

      for (const existingItem of section.items) {
        const newItem = newMap.get(existingItem.id);

        if (newItem) {
          processedIds.add(existingItem.id);
          const isRenamed =
            newItem.name !== existingItem.name ||
            newItem.owner !== existingItem.owner;

          updatedItems.push({
            ...existingItem,
            description: newItem.description,
            summary: newItem.summary,
            tags: newItem.tags,
            stars: newItem.stars,
            forks: newItem.forks,
            updated_at: newItem.updated_at,
            content_type: newItem.content_type,
            score: newItem.score,
            mirror_risk: newItem.mirror_risk,
            original_analysis_likelihood:
              newItem.original_analysis_likelihood,
            ...(isRenamed
              ? {
                  name: newItem.name,
                  owner: newItem.owner,
                  url: newItem.url,
                }
              : {}),
            new: false,
            unavailable: false,
          });
        } else {
          updatedItems.push({
            ...existingItem,
            unavailable: true,
          });
        }
      }

      return {
        ...section,
        items: updatedItems,
      };
    },
  );

  // 全新仓库（在已有数据中不存在的）放入 'other' 分类
  const brandNewItems = newItems.filter(
    (item) => !processedIds.has(item.id) && !existingMap.has(item.id),
  );

  if (brandNewItems.length > 0) {
    const otherCategory = updatedCategories.find(
      (c) => c.key === 'other',
    );

    const newItemsWithFlag = brandNewItems.map((item) => ({
      ...item,
      new: true,
      unavailable: false,
    }));

    if (otherCategory) {
      otherCategory.items = [...otherCategory.items, ...newItemsWithFlag];
    } else {
      updatedCategories.push({
        key: 'other',
        label: '其他',
        items: newItemsWithFlag,
      });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    source: existing.source,
    schema_version: existing.schema_version,
    categories: updatedCategories,
  };
}

/**
 * 尝试解析 JSON 字符串为 NavigationData。
 * 如果解析失败（畸形 JSON），返回 null。
 */
export function parseNavigationData(
  json: string,
): NavigationData | null {
  try {
    const parsed = JSON.parse(json);
    // 基本结构校验
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray(parsed.categories) &&
      typeof parsed.generated_at === 'string'
    ) {
      return parsed as NavigationData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 创建空的 NavigationData（用于畸形 JSON 回退场景）
 */
export function createFreshData(): NavigationData {
  return {
    generated_at: new Date().toISOString(),
    source: 'github',
    schema_version: '1.0.0',
    categories: [],
  };
}

/**
 * 安全的增量更新入口：处理畸形 JSON 的回退逻辑。
 *
 * @param existingJson - 已有数据的 JSON 字符串
 * @param newItems - 新扫描到的仓库列表
 * @param backupFn - 备份旧文件的回调函数
 * @returns 合并后的 NavigationData
 */
export function safeMerge(
  existingJson: string,
  newItems: NavItem[],
  backupFn?: (json: string) => void,
): NavigationData {
  const parsed = parseNavigationData(existingJson);

  if (parsed === null) {
    // 畸形 JSON：记录错误、备份旧文件、返回全新数据
    console.error(
      '[update] 畸形 JSON 数据，无法解析。将执行全量重新扫描。',
    );

    // 备份旧文件（如果提供了回调）
    if (backupFn) {
      try {
        backupFn(existingJson);
      } catch (e) {
        console.error('[update] 备份旧文件失败:', e);
      }
    }

    return createFreshData();
  }

  return mergeResults(parsed, newItems);
}
