export type OpenAIReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export const BROWSER_AI_CONFIG_STORAGE_KEY = 'pageatlas_api_config';

export interface BrowserAiConfig {
  provider?: string;
  apiKey?: string;
  doubaoEndpointIdText?: string;
  doubaoEndpointIdVision?: string;
  openaiBaseUrl?: string;
  openaiModelText?: string;
  openaiModelVision?: string;
  openaiReasoningEffort?: OpenAIReasoningEffort | string;
}

export interface ResolvedBrowserAiConfig {
  provider: string;
  apiKey: string;
  doubaoEndpointIdText: string;
  doubaoEndpointIdVision: string;
  openaiBaseUrl: string;
  openaiModelText: string;
  openaiModelVision: string;
  openaiReasoningEffort: OpenAIReasoningEffort;
}

export interface BrowserVisionMessage {
  imageDataUrl: string;
  page: number;
}

export const DEFAULT_BROWSER_AI_CONFIG: ResolvedBrowserAiConfig = {
  provider: '',
  apiKey: '',
  doubaoEndpointIdText: '',
  doubaoEndpointIdVision: '',
  openaiBaseUrl: '',
  openaiModelText: '',
  openaiModelVision: '',
  openaiReasoningEffort: 'none',
};

export function normalizeOpenAIReasoningEffort(value?: string): OpenAIReasoningEffort {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
    return value;
  }

  return 'none';
}

export function createBrowserAiConfig(overrides: Partial<BrowserAiConfig> = {}): ResolvedBrowserAiConfig {
  return {
    ...DEFAULT_BROWSER_AI_CONFIG,
    ...overrides,
    provider: overrides.provider?.trim() || DEFAULT_BROWSER_AI_CONFIG.provider,
    apiKey: overrides.apiKey?.trim() || DEFAULT_BROWSER_AI_CONFIG.apiKey,
    doubaoEndpointIdText: overrides.doubaoEndpointIdText?.trim() || DEFAULT_BROWSER_AI_CONFIG.doubaoEndpointIdText,
    doubaoEndpointIdVision: overrides.doubaoEndpointIdVision?.trim() || DEFAULT_BROWSER_AI_CONFIG.doubaoEndpointIdVision,
    openaiBaseUrl: overrides.openaiBaseUrl?.trim() || DEFAULT_BROWSER_AI_CONFIG.openaiBaseUrl,
    openaiModelText: overrides.openaiModelText?.trim() || DEFAULT_BROWSER_AI_CONFIG.openaiModelText,
    openaiModelVision: overrides.openaiModelVision?.trim() || DEFAULT_BROWSER_AI_CONFIG.openaiModelVision,
    openaiReasoningEffort: normalizeOpenAIReasoningEffort(overrides.openaiReasoningEffort),
  };
}

export function loadBrowserAiConfigFromStorage(): ResolvedBrowserAiConfig {
  if (typeof localStorage === 'undefined') {
    return createBrowserAiConfig();
  }

  const raw = localStorage.getItem(BROWSER_AI_CONFIG_STORAGE_KEY);
  if (!raw) {
    return createBrowserAiConfig();
  }

  try {
    return createBrowserAiConfig(JSON.parse(raw) as Partial<BrowserAiConfig>);
  } catch {
    return createBrowserAiConfig();
  }
}
