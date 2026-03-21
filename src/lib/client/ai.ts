import {GoogleGenerativeAI} from '@google/generative-ai';
import OpenAI from 'openai';
import {jsonrepair} from 'jsonrepair';

import {SYSTEM_PROMPT_GRAPH, SYSTEM_PROMPT_TEXT, SYSTEM_PROMPT_VISION, normalizeToc} from '$lib/utils/toc';
import type {AiTocItem} from '$lib/utils/toc';

export type BrowserAiProvider = 'gemini' | 'qwen' | 'zhipu' | 'doubao' | 'openai';

export interface BrowserAiConfig {
  provider?: string;
  apiKey?: string;
  doubaoEndpointIdText?: string;
  doubaoEndpointIdVision?: string;
  openaiBaseUrl?: string;
  openaiModelText?: string;
  openaiModelVision?: string;
}

export interface BrowserVisionMessage {
  imageDataUrl: string;
  page: number;
}

function resolveProvider(provider?: string): BrowserAiProvider {
  if (provider === 'qwen' || provider === 'zhipu' || provider === 'doubao' || provider === 'openai') {
    return provider;
  }

  return 'gemini';
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
      throw new Error(`[Doubao] ${isVision ? 'Vision' : 'Text'} model is missing.`);
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
    throw new Error(`[OpenAI Compatible] ${isVision ? 'Vision' : 'Text'} model is missing.`);
  }

  return {
    apiKey,
    baseURL: config.openaiBaseUrl?.trim() || undefined,
    model,
  };
}

async function generateOpenAICompatibleText(
  provider: BrowserAiProvider,
  prompt: string,
  systemPrompt: string | undefined,
  config: BrowserAiConfig
): Promise<string> {
  const {apiKey, baseURL, model} = resolveOpenAICompatibleSettings(provider, config, false);
  const client = createBrowserOpenAIClient(apiKey, baseURL);
  const response = await client.chat.completions.create({
    model,
    messages: [
      ...(systemPrompt ? [{role: 'system' as const, content: systemPrompt}] : []),
      {role: 'user' as const, content: prompt},
    ],
  });

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
  ] as any;

  const response = await client.chat.completions.create({
    model,
    messages: [
      {role: 'system', content: systemPrompt},
      {role: 'user', content},
    ],
  });

  return normalizeMessageContent(response.choices[0]?.message?.content);
}

export async function generateTextInBrowser(
  prompt: string,
  systemPrompt: string | undefined,
  config: BrowserAiConfig
): Promise<{provider: BrowserAiProvider; text: string}> {
  const provider = resolveProvider(config.provider);
  const apiKey = config.apiKey?.trim() || '';

  if (provider === 'gemini') {
    if (!apiKey) throw new Error('[Gemini] API Key is missing.');
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

  if (provider === 'gemini') {
    if (!apiKey) throw new Error('[Gemini] API Key is missing.');
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
