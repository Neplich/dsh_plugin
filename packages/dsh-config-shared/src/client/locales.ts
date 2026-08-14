/**
 * Shared scope-widget dictionaries for the @neplich/dsh-config-* sections.
 * Consumers spread these into their own namespace dictionary (single source
 * of truth here); keys must not collide with consumer-owned keys.
 */

/** Simplified Chinese scope-widget copy. */
export const sharedScopeZh = {
  'scope.level': '配置级别',
  'scope.personal': '个人',
  'scope.project': '项目',
  'scope.projectDisabledTip': '先在侧边栏添加工作区',
  'scope.rootAria': '选择项目根',
  'scope.rootPlaceholder': '选择项目…',
  'scope.rootsFailed': '工作区列表加载失败',
} satisfies Record<string, string>

/** English scope-widget copy. */
export const sharedScopeEn = {
  'scope.level': 'Configuration level',
  'scope.personal': 'Personal',
  'scope.project': 'Project',
  'scope.projectDisabledTip': 'Add a workspace in the sidebar first',
  'scope.rootAria': 'Select project root',
  'scope.rootPlaceholder': 'Select project…',
  'scope.rootsFailed': 'Failed to load the workspace list',
} satisfies Record<string, string>

/** Key union of the shared scope-widget copy (consumer t seats accept these). */
export type SharedScopeKey = keyof typeof sharedScopeZh

/** Translate shape the shared widgets require (assignable from any consumer t seat). */
export type SharedScopeTranslate = (key: SharedScopeKey, params?: Record<string, unknown>) => string
