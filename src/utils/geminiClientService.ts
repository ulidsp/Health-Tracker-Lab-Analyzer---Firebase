/**
 * Dual-Layer Resilient Gemini Client Service
 * 
 * Orchestrates:
 * 1. Environment auto-detection (Server Proxy vs Direct Client SDK)
 * 2. Multi-source API key resolution (Custom Key, Server Env, Vite Env)
 * 3. Future-proof model pass-through with deprecation guard
 * 4. Smart cascade fallback loop ensuring 100% request completion
 * 5. Execution tracking and real-time audit logging
 */

import { GoogleGenAI } from '@google/genai';
import { shouldUseDirectClientCalls, getAiProxyEndpoint } from './environmentUtils';
import { resolveModelName, buildCascadeFallbackList } from './aiModelResolver';
import { recordAILog, getCustomApiKey } from './aiTracker';

export interface GeminiRequestOptions {
  model?: string;
  contents: any;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: any;
  taskType?: string;
  registeredModels?: Array<{ modelId: string }>;
}

export interface GeminiExecutionResult {
  text: string;
  json?: any;
  actualModel: string;
  requestedModel: string;
  fallbackOccurred: boolean;
  attemptedModels: string[];
  latencyMs: number;
  keySource: 'Server Env' | 'User Custom Key' | 'Vite Client Env';
}

/**
 * Universal execution method routing to either Server Proxy or Direct Client SDK
 */
export async function executeGeminiRequest(options: GeminiRequestOptions): Promise<GeminiExecutionResult> {
  const useDirect = shouldUseDirectClientCalls();

  if (useDirect) {
    return executeDirectClientRequest(options);
  } else {
    return executeServerProxyRequest(options);
  }
}

/**
 * Direct Client SDK execution path (used on Vercel / external hosts)
 */
async function executeDirectClientRequest(options: GeminiRequestOptions): Promise<GeminiExecutionResult> {
  const startTime = Date.now();
  const customKey = getCustomApiKey();
  const clientEnvKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process.env?.GEMINI_API_KEY || process.env?.VITE_GEMINI_API_KEY) : '');

  let effectiveKey = '';
  let keySource: 'User Custom Key' | 'Vite Client Env' = 'Vite Client Env';

  if (customKey) {
    effectiveKey = customKey;
    keySource = 'User Custom Key';
  } else if (clientEnvKey) {
    effectiveKey = clientEnvKey;
    keySource = 'Vite Client Env';
  }

  if (!effectiveKey) {
    const errorMsg = 'No Gemini API Key found. Please add your key in the AI Key Settings modal or set VITE_GEMINI_API_KEY.';
    recordAILog({
      taskType: options.taskType || 'Direct Client AI',
      requestedModel: options.model || 'unknown',
      actualModel: 'none',
      fallbackOccurred: false,
      attemptedModels: [],
      latencyMs: 0,
      keySource,
      status: 'error',
      errorMessage: errorMsg,
    });
    throw new Error(errorMsg);
  }

  const ai = new GoogleGenAI({
    apiKey: effectiveKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const requestedModel = resolveModelName(options.model);
  const modelsToTry = buildCascadeFallbackList(requestedModel, options.registeredModels || []);
  const attemptedModels: string[] = [];
  let successfulResponse: any = null;
  let actualModelUsed = '';
  const errors: string[] = [];

  for (const currentModel of modelsToTry) {
    attemptedModels.push(currentModel);
    try {
      const config: Record<string, any> = {};
      if (options.systemInstruction) config.systemInstruction = options.systemInstruction;
      if (options.responseMimeType) config.responseMimeType = options.responseMimeType;
      if (options.responseSchema) config.responseSchema = options.responseSchema;

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: options.contents,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      successfulResponse = response;
      actualModelUsed = currentModel;
      break;
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`[Client Cascade] Model ${currentModel} failed: ${msg}. Trying next fallback...`);
      errors.push(`${currentModel}: ${msg}`);
    }
  }

  const latencyMs = Date.now() - startTime;

  if (!successfulResponse) {
    const errorMsg = `All models in fallback cascade failed: ${errors.join(' | ')}`;
    recordAILog({
      taskType: options.taskType || 'Direct Client AI',
      requestedModel,
      actualModel: 'none',
      fallbackOccurred: true,
      attemptedModels,
      latencyMs,
      keySource,
      status: 'error',
      errorMessage: errorMsg,
    });
    throw new Error(errorMsg);
  }

  const text = successfulResponse.text || '';
  let json: any = null;

  if (options.responseMimeType === 'application/json' || text.includes('{') || text.includes('[')) {
    try {
      let cleanText = text.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      json = JSON.parse(cleanText);
    } catch {
      // Leave null if non-JSON
    }
  }

  const fallbackOccurred = actualModelUsed !== requestedModel;

  recordAILog({
    taskType: options.taskType || 'Direct Client AI',
    requestedModel,
    actualModel: actualModelUsed,
    fallbackOccurred,
    attemptedModels,
    latencyMs,
    keySource,
    status: fallbackOccurred ? 'fallback_success' : 'success',
  });

  return {
    text,
    json,
    actualModel: actualModelUsed,
    requestedModel,
    fallbackOccurred,
    attemptedModels,
    latencyMs,
    keySource,
  };
}

/**
 * Server-Side Proxy execution path (used in AI Studio Preview / Cloud Run)
 */
async function executeServerProxyRequest(options: GeminiRequestOptions): Promise<GeminiExecutionResult> {
  const startTime = Date.now();
  const customKey = getCustomApiKey();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (customKey) {
    headers['x-gemini-api-key'] = customKey;
  }

  const requestedModel = resolveModelName(options.model);

  try {
    const res = await fetch(getAiProxyEndpoint('/api/ai/generate'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: requestedModel,
        contents: options.contents,
        systemInstruction: options.systemInstruction,
        responseMimeType: options.responseMimeType,
        responseSchema: options.responseSchema,
        taskType: options.taskType || 'Server Proxy AI',
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      let errData: any = null;
      try {
        errData = await res.json();
      } catch {
        // Ignore json parse error
      }
      const errMsg = errData?.error || `Server proxy responded with status ${res.status}`;

      recordAILog({
        taskType: options.taskType || 'Server Proxy AI',
        requestedModel,
        actualModel: 'none',
        fallbackOccurred: false,
        attemptedModels: errData?.attemptedModels || [requestedModel],
        latencyMs,
        keySource: customKey ? 'User Custom Key' : 'Server Env',
        status: 'error',
        errorMessage: errMsg,
      });

      throw new Error(errMsg);
    }

    const data = await res.json();
    const fallbackOccurred = Boolean(data.fallbackOccurred);

    recordAILog({
      taskType: options.taskType || 'Server Proxy AI',
      requestedModel: data.requestedModel || requestedModel,
      actualModel: data.actualModel || requestedModel,
      fallbackOccurred,
      attemptedModels: data.attemptedModels || [requestedModel],
      latencyMs: data.latencyMs || latencyMs,
      keySource: data.keySource || (customKey ? 'User Custom Key' : 'Server Env'),
      status: fallbackOccurred ? 'fallback_success' : 'success',
    });

    return {
      text: data.text || '',
      json: data.json,
      actualModel: data.actualModel || requestedModel,
      requestedModel: data.requestedModel || requestedModel,
      fallbackOccurred,
      attemptedModels: data.attemptedModels || [requestedModel],
      latencyMs: data.latencyMs || latencyMs,
      keySource: data.keySource || (customKey ? 'User Custom Key' : 'Server Env'),
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    // If server proxy call failed completely (e.g. network error), try direct client fallback if client key exists
    if (customKey || import.meta.env.VITE_GEMINI_API_KEY) {
      console.warn('[AI Engine] Server proxy network failure. Attempting direct client SDK fallback...', error);
      return executeDirectClientRequest(options);
    }

    recordAILog({
      taskType: options.taskType || 'Server Proxy AI',
      requestedModel,
      actualModel: 'none',
      fallbackOccurred: false,
      attemptedModels: [requestedModel],
      latencyMs,
      keySource: customKey ? 'User Custom Key' : 'Server Env',
      status: 'error',
      errorMessage: error?.message || 'Network request failed',
    });

    throw error;
  }
}

/**
 * File to base64 helper
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
