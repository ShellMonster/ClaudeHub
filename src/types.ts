/** GitHub 仓库搜索配置 */
export interface SearchConfig {
  /** 搜索关键词 */
  query: string;
  /** 排序方式 */
  sort: 'stars' | 'updated';
  /** 每页返回数量 */
  perPage: number;
}
