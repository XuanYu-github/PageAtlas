import {GoogleGenerativeAI} from '@google/generative-ai';
import OpenAI from 'openai';
import {jsonrepair} from 'jsonrepair';

import {
  normalizeOpenAIReasoningEffort,
  type BrowserAiConfig,
  type BrowserVisionMessage,
  type OpenAIReasoningEffort,
} from '$lib/client/ai-config';
import {SYSTEM_PROMPT_GRAPH, SYSTEM_PROMPT_TEXT, SYSTEM_PROMPT_VISION, normalizeToc} from '$lib/utils/toc';
import type {AiTocItem} from '$lib/utils/toc';

export type BrowserAiProvider = 'gemini' | 'qwen' | 'zhipu' | 'doubao' | 'openai';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type OpenAICompatibleChatRequest = {
  model: string;
  messages: unknown[];
  stream?: boolean;
  max_tokens?: number;
  reasoning_effort?: Exclude<OpenAIReasoningEffort, 'none'>;
};

export type BrowserAiConnectionErrorCode =
  | 'api_key_missing'
  | 'model_missing'
  | 'model_not_found'
  | 'base_url_invalid'
  | 'network_unreachable'
  | 'cors_models_blocked'
  | 'cors_chat_blocked'
  | 'network_or_cors'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'unknown';

export class BrowserAiConnectionError extends Error {
  code: BrowserAiConnectionErrorCode;
  provider: BrowserAiProvider;
  status?: number;
  detail?: string;

  constructor(options: {
    code: BrowserAiConnectionErrorCode;
    provider: BrowserAiProvider;
    message: string;
    status?: number;
    detail?: string;
  }) {
    super(options.message);
    this.name = 'BrowserAiConnectionError';
    this.code = options.code;
    this.provider = options.provider;
    this.status = options.status;
    this.detail = options.detail;
  }
}

export type BrowserAiConnectionStageKey = 'models' | 'chat' | 'generate';

export interface BrowserAiConnectionDiagnosticStage {
  key: BrowserAiConnectionStageKey;
  endpoint: string;
  status: 'success' | 'error' | 'skipped';
  error?: BrowserAiConnectionError;
}

export interface BrowserAiConnectionDiagnostic {
  provider: BrowserAiProvider;
  ok: boolean;
  stages: BrowserAiConnectionDiagnosticStage[];
}

function resolveProvider(provider?: string): BrowserAiProvider {
  if (provider === 'qwen' || provider === 'zhipu' || provider === 'doubao' || provider === 'openai') {
    return provider;
  }

  return 'gemini';
}

async function getTauriInvoke(): Promise<TauriInvoke | null> {
  if (typeof window === 'undefined') return null;
  if (!('__TAURI_INTERNALS__' in window)) return null;

  const {invoke} = await import('@tauri-apps/api/core');
  return invoke as TauriInvoke;
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const maybeText = part as {type?: unknown; text?: unknown};
      return maybeText.type === 'text' && typeof maybeText.text === 'string' ? maybeText.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.replace(/```json\n?|```/g, '').trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return JSON.parse(jsonrepair(cleaned)) as T;
  }
}

function createBrowserOpenAIClient(apiKey: string, baseURL?: string): OpenAI {
  return new OpenAI({
    apiKey,
    ...(baseURL ? {baseURL} : {}),
    dangerouslyAllowBrowser: true,
  });
}

async function generateWithGeminiText(prompt: string, systemPrompt: string | undefined, apiKey: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent([prompt]);
  return result.response.text();
}

async function generateWithGeminiVision(
  prompt: string,
  systemPrompt: string,
  images: BrowserVisionMessage[],
  apiKey: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
  });

  const imageParts = images.map(({imageDataUrl}) => ({
    inlineData: {
      data: imageDataUrl.includes('base64,') ? imageDataUrl.split(',')[1] : imageDataUrl,
      mimeType: imageDataUrl.match(/data:(.*?);/)?.[1] || 'image/png',
    },
  }));

  const result = await model.generateContent([prompt, ...imageParts]);
  return result.response.text();
}

function resolveOpenAICompatibleSettings(provider: BrowserAiProvider, config: BrowserAiConfig, isVision: boolean): {
  apiKey: string;
  baseURL?: string;
  model: string;
} {
  const apiKey = config.apiKey?.trim() || '';
  if (!apiKey) {
    throw new Error(`[${provider}] API Key is missing.`);
  }

  if (provider === 'qwen') {
    return {
      apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: isVision ? 'qwen-vl-plus' : 'qwen-plus',
    };
  }

  if (provider === 'zhipu') {
    return {
      apiKey,
      baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
      model: isVision ? 'glm-4v-flash' : 'glm-4-flash',
    };
  }

  if (provider === 'doubao') {
    const model = isVision ? config.doubaoEndpointIdVision : config.doubaoEndpointIdText;
    if (!model) {
      throw new BrowserAiConnectionError({
        code: 'model_missing',
        provider,
        message: `[Doubao] ${isVision ? 'Vision' : 'Text'} model is missing.`,
      });
    }

    return {
      apiKey,
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
      model,
    };
  }

  const model = isVision
    ? config.openaiModelVision?.trim() || config.openaiModelText?.trim()
    : config.openaiModelText?.trim();

  if (!model) {
    throw new BrowserAiConnectionError({
      code: 'model_missing',
      provider,
      message: `[OpenAI Compatible] ${isVision ? 'Vision' : 'Text'} model is missing.`,
    });
  }

  const baseURL = config.openaiBaseUrl?.trim() || undefined;
  if (baseURL) {
    try {
      new URL(baseURL);
    } catch {
      throw new BrowserAiConnectionError({
        code: 'base_url_invalid',
        provider,
        message: '[OpenAI Compatible] Base URL is invalid.',
      });
    }
  }

  return {
    apiKey,
    baseURL,
    model,
  };
}

function resolveOpenAIReasoningEffort(
  provider: BrowserAiProvider,
  config: BrowserAiConfig
): Exclude<OpenAIReasoningEffort, 'none'> | undefined {
  if (provider !== 'openai') return undefined;

  const effort = normalizeOpenAIReasoningEffort(config.openaiReasoningEffort);
  return effort === 'none' ? undefined : effort;
}

function createOpenAICompatibleChatRequest(options: {
  provider: BrowserAiProvider;
  model: string;
  messages: unknown[];
  config: BrowserAiConfig;
  maxTokens?: number;
}): OpenAICompatibleChatRequest {
  const reasoningEffort = resolveOpenAIReasoningEffort(options.provider, options.config);

  return {
    model: options.model,
    messages: options.messages,
    stream: false,
    ...(typeof options.maxTokens === 'number' ? {max_tokens: options.maxTokens} : {}),
    ...(reasoningEffort ? {reasoning_effort: reasoningEffort} : {}),
  };
}

function normalizeUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

async function canReachOriginWithoutCors(baseURL?: string): Promise<boolean> {
  if (!baseURL) return false;

  try {
    const url = new URL(baseURL);
    await fetch(url.origin, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
    });
    return true;
  } catch {
    return false;
  }
}

function classifyConnectionError(
  provider: BrowserAiProvider,
  error: unknown
): BrowserAiConnectionError {
  if (error instanceof BrowserAiConnectionError) {
    return error;
  }

  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as {status?: unknown}).status)
    : undefined;
  const message = normalizeUnknownErrorMessage(error);
  const lowered = message.toLowerCase();

  if (lowered.includes('api key is missing')) {
    return new BrowserAiConnectionError({
      code: 'api_key_missing',
      provider,
      message,
    });
  }

  if (lowered.includes('model is missing')) {
    return new BrowserAiConnectionError({
      code: 'model_missing',
      provider,
      message,
    });
  }

  if (lowered.includes('model "') && lowered.includes('was not found')) {
    return new BrowserAiConnectionError({
      code: 'model_not_found',
      provider,
      status,
      message,
    });
  }

  if (lowered.includes('base url is invalid') || lowered.includes('invalid url')) {
    return new BrowserAiConnectionError({
      code: 'base_url_invalid',
      provider,
      message,
    });
  }

  if (status === 401) {
    return new BrowserAiConnectionError({
      code: 'unauthorized',
      provider,
      status,
      message,
    });
  }

  if (status === 403) {
    return new BrowserAiConnectionError({
      code: 'forbidden',
      provider,
      status,
      message,
    });
  }

  if (status === 404) {
    return new BrowserAiConnectionError({
      code: 'not_found',
      provider,
      status,
      message,
    });
  }

  if (status === 429) {
    return new BrowserAiConnectionError({
      code: 'rate_limited',
      provider,
      status,
      message,
    });
  }

  if (
    lowered.includes('connection error') ||
    lowered.includes('failed to fetch') ||
    lowered.includes('fetch failed') ||
    lowered.includes('networkerror') ||
    lowered.includes('load failed') ||
    lowered.includes('cors')
  ) {
    return new BrowserAiConnectionError({
      code: 'network_or_cors',
      provider,
      status,
      message,
    });
  }

  return new BrowserAiConnectionError({
    code: 'unknown',
    provider,
    status,
    message,
  });
}

async function testOpenAICompatibleModelsEndpoint(config: BrowserAiConfig): Promise<{
  provider: BrowserAiProvider;
  model: string;
}> {
  const provider = resolveProvider(config.provider);
  const {apiKey, baseURL, model} = resolveOpenAICompatibleSettings(provider, config, false);
  const modelsUrl = `${(baseURL || '').replace(/\/$/, '')}/models`;

  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      throw new BrowserAiConnectionError({
        code: 'unauthorized',
        provider,
        status: 401,
        message: '401 Unauthorized',
      });
    }

    if (response.status === 403) {
      throw new BrowserAiConnectionError({
        code: 'forbidden',
        provider,
        status: 403,
        message: '403 Forbidden',
      });
    }

    if (response.status === 404) {
      throw new BrowserAiConnectionError({
        code: 'not_found',
        provider,
        status: 404,
        message: '404 Not Found',
      });
    }

    if (response.status === 429) {
      throw new BrowserAiConnectionError({
        code: 'rate_limited',
        provider,
        status: 429,
        message: '429 Too Many Requests',
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new BrowserAiConnectionError({
        code: 'unknown',
        provider,
        status: response.status,
        message: text || `${response.status} ${response.statusText}`,
      });
    }

    const payload = await response.json().catch(() => null) as {data?: Array<{id?: string}>} | null;
    const modelIds = payload?.data?.map((item) => item.id).filter((id): id is string => typeof id === 'string') || [];

    if (modelIds.length > 0 && !modelIds.includes(model)) {
      throw new BrowserAiConnectionError({
        code: 'model_not_found',
        provider,
        status: 404,
        message: `Model "${model}" was not found in /models.`,
        detail: model,
      });
    }

    return {provider, model};
  } catch (error) {
    const classified = classifyConnectionError(provider, error);

    if (classified.code === 'network_or_cors') {
      const originReachable = await canReachOriginWithoutCors(baseURL);
      throw new BrowserAiConnectionError({
        code: originReachable ? 'cors_models_blocked' : 'network_unreachable',
        provider,
        message: classified.message,
        detail: modelsUrl,
      });
    }

    throw classified;
  }
}

async function testOpenAICompatibleChatEndpoint(config: BrowserAiConfig): Promise<{
  provider: BrowserAiProvider;
  model: string;
}> {
  const provider = resolveProvider(config.provider);
  const {apiKey, baseURL, model} = resolveOpenAICompatibleSettings(provider, config, false);
  const chatUrl = `${(baseURL || '').replace(/\/$/, '')}/chat/completions`;

  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createOpenAICompatibleChatRequest({
        provider,
        model,
        messages: [{role: 'user', content: 'Reply with exactly: OK'}],
        config,
        maxTokens: 1,
      })),
    });

    if (response.status === 401) {
      throw new BrowserAiConnectionError({
        code: 'unauthorized',
        provider,
        status: 401,
        message: '401 Unauthorized',
      });
    }

    if (response.status === 403) {
      throw new BrowserAiConnectionError({
        code: 'forbidden',
        provider,
        status: 403,
        message: '403 Forbidden',
      });
    }

    if (response.status === 404) {
      throw new BrowserAiConnectionError({
        code: 'not_found',
        provider,
        status: 404,
        message: '404 Not Found',
      });
    }

    if (response.status === 429) {
      throw new BrowserAiConnectionError({
        code: 'rate_limited',
        provider,
        status: 429,
        message: '429 Too Many Requests',
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new BrowserAiConnectionError({
        code: 'unknown',
        provider,
        status: response.status,
        message: text || `${response.status} ${response.statusText}`,
      });
    }

    return {provider, model};
  } catch (error) {
    const classified = classifyConnectionError(provider, error);

    if (classified.code === 'network_or_cors') {
      throw new BrowserAiConnectionError({
        code: 'cors_chat_blocked',
        provider,
        message: classified.message,
        detail: chatUrl,
      });
    }

    throw classified;
  }
}

async function generateOpenAICompatibleText(
  provider: BrowserAiProvider,
  prompt: string,
  systemPrompt: string | undefined,
  config: BrowserAiConfig
): Promise<string> {
  const {apiKey, baseURL, model} = resolveOpenAICompatibleSettings(provider, config, false);
  const client = createBrowserOpenAIClient(apiKey, baseURL);
  const request = createOpenAICompatibleChatRequest({
    provider,
    model,
    config,
    messages: [
      ...(systemPrompt ? [{role: 'system' as const, content: systemPrompt}] : []),
      {role: 'user' as const, content: prompt},
    ],
  });
  const response = await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0]
  ) as Awaited<ReturnType<typeof client.chat.completions.create>> & {choices: Array<{message?: {content?: unknown}}>};

  return normalizeMessageContent(response.choices[0]?.message?.content);
}

async function generateOpenAICompatibleVision(
  provider: BrowserAiProvider,
  prompt: string,
  systemPrompt: string,
  images: BrowserVisionMessage[],
  config: BrowserAiConfig
): Promise<string> {
  const {apiKey, baseURL, model} = resolveOpenAICompatibleSettings(provider, config, true);
  const client = createBrowserOpenAIClient(apiKey, baseURL);
  const content = [
    {type: 'text', text: prompt},
    ...images.map(({imageDataUrl}) => ({type: 'image_url', image_url: {url: imageDataUrl}})),
  ];

  const request = createOpenAICompatibleChatRequest({
    provider,
    model,
    config,
    messages: [
      {role: 'system', content: systemPrompt},
      {role: 'user', content},
    ],
  });
  const response = await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0]
  ) as Awaited<ReturnType<typeof client.chat.completions.create>> & {choices: Array<{message?: {content?: unknown}}>};

  return normalizeMessageContent(response.choices[0]?.message?.content);
}

export async function generateTextInBrowser(
  prompt: string,
  systemPrompt: string | undefined,
  config: BrowserAiConfig
): Promise<{provider: BrowserAiProvider; text: string}> {
  const provider = resolveProvider(config.provider);
  const apiKey = config.apiKey?.trim() || '';

  if (provider !== 'gemini') {
    const invoke = await getTauriInvoke();
    if (invoke) {
      const result = await invoke<{provider: string; text: string}>('invoke_openai_compatible_text', {
        provider,
        prompt,
        systemPrompt,
        config,
      });
      return {provider, text: result.text};
    }
  }

  if (provider === 'gemini') {
    if (!apiKey) {
      throw new BrowserAiConnectionError({
        code: 'api_key_missing',
        provider,
        message: '[Gemini] API Key is missing.',
      });
    }
    return {provider, text: await generateWithGeminiText(prompt, systemPrompt, apiKey)};
  }

  return {provider, text: await generateOpenAICompatibleText(provider, prompt, systemPrompt, config)};
}

export async function generateVisionInBrowser(
  prompt: string,
  systemPrompt: string,
  images: BrowserVisionMessage[],
  config: BrowserAiConfig
): Promise<{provider: BrowserAiProvider; text: string}> {
  const provider = resolveProvider(config.provider);
  const apiKey = config.apiKey?.trim() || '';

  if (provider !== 'gemini') {
    const invoke = await getTauriInvoke();
    if (invoke) {
      const result = await invoke<{provider: string; text: string}>('invoke_openai_compatible_vision', {
        provider,
        prompt,
        systemPrompt,
        images,
        config,
      });
      return {provider, text: result.text};
    }
  }

  if (provider === 'gemini') {
    if (!apiKey) {
      throw new BrowserAiConnectionError({
        code: 'api_key_missing',
        provider,
        message: '[Gemini] API Key is missing.',
      });
    }
    return {provider, text: await generateWithGeminiVision(prompt, systemPrompt, images, apiKey)};
  }

  return {provider, text: await generateOpenAICompatibleVision(provider, prompt, systemPrompt, images, config)};
}

export async function processTocInBrowser(options: {
  images?: string[];
  text?: string;
  config: BrowserAiConfig;
}): Promise<AiTocItem[]> {
  const isTextMode = !!options.text?.trim();

  let rawText = '';
  if (isTextMode) {
    const result = await generateTextInBrowser(options.text!.trim(), SYSTEM_PROMPT_TEXT, options.config);
    rawText = result.text;
  } else {
    const images = (options.images || []).map((imageDataUrl, index) => ({imageDataUrl, page: index + 1}));
    const result = await generateVisionInBrowser(
      'Analyze these Table of Contents images and return the single structured JSON array.',
      SYSTEM_PROMPT_VISION,
      images,
      options.config,
    );
    rawText = result.text;
  }

  let rawString = rawText.replace(/```json\n?|```/g, '').trim();
  const firstBracket = rawString.indexOf('[');
  if (firstBracket !== -1) {
    rawString = rawString.substring(firstBracket);
  }

  return normalizeToc(parseJsonResponse<unknown[]>(rawString));
}

export async function generateKnowledgeBoardInBrowser(options: {
  tocItems: Array<{id: string; title: string; page: number | null}>;
  config: BrowserAiConfig;
}): Promise<{
  nodes: Array<{id: string; label?: string; cluster?: string; page?: number | null}>;
  edges: Array<{source: string; target: string; type?: string; label?: string}>;
}> {
  const tocText = options.tocItems
    .map((item) => `[ID:${item.id}] ${item.title} (Page: ${item.page || 'N/A'})`)
    .join('\n');

  const result = await generateTextInBrowser(`ToC Data:\n${tocText}`, SYSTEM_PROMPT_GRAPH, options.config);
  const cleanedJson = result.text.replace(/```json\n?|```/g, '').trim();
  return parseJsonResponse(cleanedJson);
}

export async function answerPdfQuestionInBrowser(options: {
  question: string;
  citations: number[];
  textContext?: string;
  images?: BrowserVisionMessage[];
  config: BrowserAiConfig;
}): Promise<{answer: string; citations: number[]; provider: BrowserAiProvider}> {
  const prompt = `You are a careful PDF reading assistant.
Answer using only the provided PDF context.
If the answer is not in the supplied content, say so clearly.
Return JSON only in this format:
{"answer":"string","citations":[1,2]}
Only cite page numbers from this allowed set: [${options.citations.join(', ')}].

Question:
${options.question}

${options.textContext ? `Context:\n${options.textContext}` : 'Some source pages are attached as images.'}`;

  const result = options.images && options.images.length > 0
    ? await generateVisionInBrowser(prompt, 'You are a precise PDF QA assistant.', options.images, options.config)
    : await generateTextInBrowser(prompt, 'You are a precise PDF QA assistant.', options.config);

  const parsed = parseJsonResponse<{answer?: unknown; citations?: unknown}>(result.text);
  return {
    answer: typeof parsed.answer === 'string' ? parsed.answer : result.text,
    citations: Array.isArray(parsed.citations)
      ? parsed.citations
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && options.citations.includes(value))
      : options.citations.slice(0, 1),
    provider: result.provider,
  };
}

export async function testBrowserAiConnection(config: BrowserAiConfig): Promise<{
  provider: BrowserAiProvider;
  text: string;
}> {
  const diagnostic = await diagnoseBrowserAiConnection(config);
  if (!diagnostic.ok) {
    const firstError = diagnostic.stages.find((stage) => stage.status === 'error')?.error;
    throw firstError || new BrowserAiConnectionError({
      code: 'unknown',
      provider: diagnostic.provider,
      message: 'Connection test failed.',
    });
  }

  return {
    provider: diagnostic.provider,
    text: 'OK',
  };
}

export async function diagnoseBrowserAiConnection(
  config: BrowserAiConfig
): Promise<BrowserAiConnectionDiagnostic> {
  const provider = resolveProvider(config.provider);

  if (provider !== 'gemini') {
    const invoke = await getTauriInvoke();
    if (invoke) {
      return await invoke<BrowserAiConnectionDiagnostic>('diagnose_ai_connection', {config});
    }
  }

  if (provider === 'openai') {
    try {
      const result = await testOpenAICompatibleModelsEndpoint(config);

      try {
        await testOpenAICompatibleChatEndpoint(config);
        return {
          provider: result.provider,
          ok: true,
          stages: [
            {key: 'models', endpoint: 'GET /models', status: 'success'},
            {key: 'chat', endpoint: 'POST /chat/completions', status: 'success'},
          ],
        };
      } catch (error) {
        const classified = classifyConnectionError(provider, error);
        return {
          provider,
          ok: false,
          stages: [
            {key: 'models', endpoint: 'GET /models', status: 'success'},
            {key: 'chat', endpoint: 'POST /chat/completions', status: 'error', error: classified},
          ],
        };
      }
    } catch (error) {
      const classified = classifyConnectionError(provider, error);
      return {
        provider,
        ok: false,
        stages: [
          {key: 'models', endpoint: 'GET /models', status: 'error', error: classified},
          {key: 'chat', endpoint: 'POST /chat/completions', status: 'skipped'},
        ],
      };
    }
  }

  try {
    const result = await generateTextInBrowser(
      'Reply with exactly: OK',
      'You are a connection test endpoint. Reply with exactly OK.',
      config,
    );

    const text = result.text.trim();
    if (!text) {
      throw new BrowserAiConnectionError({
        code: 'unknown',
        provider,
        message: 'The provider returned an empty response.',
      });
    }

    return {
      provider: result.provider,
      ok: true,
      stages: [
        {key: 'generate', endpoint: 'Text generation', status: 'success'},
      ],
    };
  } catch (error) {
    const classified = classifyConnectionError(provider, error);
    return {
      provider,
      ok: false,
      stages: [
        {key: 'generate', endpoint: 'Text generation', status: 'error', error: classified},
      ],
    };
  }
}
