/**
 * Codex settings-section dictionaries. All user-visible copy of
 * the section flows through these two dictionaries so the section follows
 * dsh's active language.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Codex settings section copy. */
    'codex-chatgpt': CodexChatgptKey
  }
}

/** Simplified Chinese section messages. */
const codexZh = {
  'nav.label': 'Codex',
  'section.heading': 'Codex',
  'account.heading': '账号',
  'account.signedIn': '已登录',
  'account.signedOut': '未登录',
  'account.accountId': '账号 ID：{id}',
  'account.tokenExpiry': '访问令牌有效期至 {time}',
  'account.tokenExpired': '访问令牌已过期，将自动刷新',
  'account.hint': '登录态保存在 Codex CLI 凭证文件（auth.json）中，与 codex login 共享；令牌过期后会自动刷新。',
  'action.login': '使用 ChatGPT 登录',
  'action.loginWaiting': '等待浏览器授权…',
  'action.logout': '退出登录',
  'action.save': '保存',
  'action.saving': '保存中…',
  'action.refresh': '刷新',
  'action.resetAll': '全部启用',
  'login.pending': '已在新标签页打开授权页，完成登录后此处会自动更新。',
  'login.done': '登录成功{account}',
  'login.doneAccount': '（账号 {id}）',
  'login.failed': '登录失败：{message}',
  'models.heading': '模型',
  'models.intro': '模型列表实时取自后端（需要已登录）。勾选要在模型选择器中显示的模型。',
  'models.loading': '正在获取模型列表…',
  'models.failed': '获取模型列表失败：{message}',
  'models.loginFirst': '登录后即可获取当前订阅可用的模型列表。',
  'models.contextWindow': '上下文 {tokens}',
  'models.saved': '已保存',
  'models.empty': '后端未返回可用模型。',
  'error.generic': '操作失败：{message}',
} satisfies Record<string, string>

/** English section messages. */
const codexEn = {
  'nav.label': 'Codex',
  'section.heading': 'Codex',
  'account.heading': 'Account',
  'account.signedIn': 'Signed in',
  'account.signedOut': 'Signed out',
  'account.accountId': 'Account ID: {id}',
  'account.tokenExpiry': 'Access token valid until {time}',
  'account.tokenExpired': 'Access token expired; it refreshes automatically',
  'account.hint': 'Login state lives in the Codex CLI credential file (auth.json), shared with codex login; expired tokens refresh automatically.',
  'action.login': 'Sign in with ChatGPT',
  'action.loginWaiting': 'Waiting for browser authorization…',
  'action.logout': 'Sign out',
  'action.save': 'Save',
  'action.saving': 'Saving…',
  'action.refresh': 'Refresh',
  'action.resetAll': 'Enable all',
  'login.pending': 'The authorization page opened in a new tab; this page updates automatically once you finish.',
  'login.done': 'Signed in{account}',
  'login.doneAccount': ' (account {id})',
  'login.failed': 'Login failed: {message}',
  'models.heading': 'Models',
  'models.intro': 'The model list is fetched live from the backend (sign-in required). Check the models shown in the model picker.',
  'models.loading': 'Fetching the model list…',
  'models.failed': 'Failed to fetch the model list: {message}',
  'models.loginFirst': 'Sign in to fetch the models available to your subscription.',
  'models.contextWindow': 'Context {tokens}',
  'models.saved': 'Saved',
  'models.empty': 'The backend returned no usable models.',
  'error.generic': 'Operation failed: {message}',
} satisfies Record<string, string>

/** Codex settings-section namespace. */
export const NS = 'codex-chatgpt'

/** Complete zh dictionary. */
export const zh = { ...codexZh }

/** Complete en dictionary. */
export const en = { ...codexEn }

/** Key union of the dictionary (the namespace's LocaleNamespaceMap entry). */
export type CodexChatgptKey = keyof typeof zh
