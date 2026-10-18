/**
 * Dual-Layer Resilient Gemini Client Service
 * 
 * Orchestrates:
 * 1. Two-Tier Key Priority Resolution:
 *    - Priority 1: Browser Local Storage Key (Custom Key)
 *    - Priority 2: Vercel Server / AI Studio Environment Key (GEMINI_API_KEY)
 *    If Priority 1 fails (Quota 429, Invalid Key 400/401/403, or empty), auto-fails over to Priority 2.
 * 2. Smart cascade fallback loop across model families ensuring 100% request completion
 * 3. Environment detection routing to Serverless Proxy or Direct Client SDK
 * 4. Transparent execution tracking and audit logging
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
  keyFailoverOccurred?: boolean;
  keyFailoverReason?: string;
}

/**
 * Universal execution method implementing Two-Tier API Key Priority:
 * Priority 1: Browser Local Storage Key
 * Priority 2: Vercel Server / Environment Key
 */
export async function executeGeminiRequest(options: GeminiRequestOptions): Promise<GeminiExecutionResult> {
  const customKey = getCustomApiKey();
  const startTime = Date.now();

  // If user entered a key in Local Storage, attempt Priority 1 first
  if (customKey && customKey.trim()) {
    try {
      console.log('[AI Key Priority] Attempting Priority 1: Browser Local Storage Key...');
      const result = await invokeWithKey(options, customKey.trim(), 'User Custom Key');
      return result;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[AI Key Priority] Priority 1 (Local Storage Key) failed: ${errMsg}. Auto-failing over to Priority 2 (Vercel Server Key)...`);

      // Priority 1 failed (quota exceeded, bad key, or API issue)
      // Automatically fall over to Priority 2: Server API Key!
      try {
        const fallbackResult = await invokeWithServerKey(options);
        const latencyMs = Date.now() - startTime;

        const enhancedResult: GeminiExecutionResult = {
          ...fallbackResult,
          keyFailoverOccurred: true,
          keyFailoverReason: `Priority 1 (Local Storage Key) failed: ${errMsg} -> Fell back to Vercel Server Key`,
          latencyMs,
        };

        recordAILog({
          taskType: options.taskType || 'AI Request',
          requestedModel: fallbackResult.requestedModel,
          actualModel: fallbackResult.actualModel,
          fallbackOccurred: fallbackResult.fallbackOccurred,
          attemptedModels: fallbackResult.attemptedModels,
          latencyMs,
          keySource: fallbackResult.keySource,
          keyFailoverOccurred: true,
          keyFailoverReason: enhancedResult.keyFailoverReason,
          status: 'fallback_success',
        });

        return enhancedResult;
      } catch (serverErr: any) {
        const finalErrorMsg = `Both Priority 1 (Local Storage) and Priority 2 (Server Key) failed. LocalStorage error: ${errMsg} | Server error: ${serverErr?.message || serverErr}`;
        recordAILog({
          taskType: options.taskType || 'AI Request',
          requestedModel: options.model || 'unknown',
          actualModel: 'none',
          fallbackOccurred: true,
          attemptedModels: [],
          latencyMs: Date.now() - startTime,
          keySource: 'Server Env',
          keyFailoverOccurred: true,
          keyFailoverReason: `LocalStorage failed (${errMsg}) and Server failed (${serverErr?.message || serverErr})`,
          status: 'error',
          errorMessage: finalErrorMsg,
        });
        throw new Error(finalErrorMsg);
      }
    }
  }

  // If no Local Storage key was provided, go directly to Priority 2: Server Key
  console.log('[AI Key Priority] No Local Storage key set. Directly using Priority 2: Vercel Server Key...');
  return invokeWithServerKey(options);
}

/**
 * Invoke using a specific key (Priority 1: Local Storage Key)
 */
async function invokeWithKey(
  options: GeminiRequestOptions,
  apiKey: string,
  keySource: 'User Custom Key'
): Promise<GeminiExecutionResult> {
  const startTime = Date.now();
  const useDirect = shouldUseDirectClientCalls();

  // If in direct client mode (e.g. Vercel client bundle)
  if (useDirect) {
    return runDirectClientLoop(options, apiKey, keySource, startTime);
  }

  // If in server proxy mode (AI Studio / Cloud Run)
  const res = await fetch(getAiProxyEndpoint('/api/ai/generate'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-gemini-api-key': apiKey,
    },
    body: JSON.stringify({
      model: resolveModelName(options.model),
      contents: options.contents,
      systemInstruction: options.systemInstruction,
      responseMimeType: options.responseMimeType,
      responseSchema: options.responseSchema,
      taskType: options.taskType || 'Priority 1 AI Request',
    }),
  });

  const latencyMs = Date.now() - startTime;

  if (!res.ok) {
    let errData: any = null;
    try {
      errData = await res.json();
    } catch {}
    const errMsg = errData?.error || `Server responded with status ${res.status}`;
    throw new Error(errMsg);
  }

  const data = await res.json();
  const fallbackOccurred = Boolean(data.fallbackOccurred);

  recordAILog({
    taskType: options.taskType || 'AI Request',
    requestedModel: data.requestedModel || resolveModelName(options.model),
    actualModel: data.actualModel || resolveModelName(options.model),
    fallbackOccurred,
    attemptedModels: data.attemptedModels || [],
    latencyMs: data.latencyMs || latencyMs,
    keySource: data.keySource || keySource,
    keyFailoverOccurred: Boolean(data.keyFailoverOccurred),
    keyFailoverReason: data.keyFailoverReason,
    status: fallbackOccurred ? 'fallback_success' : 'success',
  });

  return {
    text: data.text || '',
    json: data.json,
    actualModel: data.actualModel || resolveModelName(options.model),
    requestedModel: data.requestedModel || resolveModelName(options.model),
    fallbackOccurred,
    attemptedModels: data.attemptedModels || [],
    latencyMs: data.latencyMs || latencyMs,
    keySource: data.keySource || keySource,
    keyFailoverOccurred: data.keyFailoverOccurred,
    keyFailoverReason: data.keyFailoverReason,
  };
}

/**
 * Invoke using Priority 2: Vercel Server / Environment Key
 */
async function invokeWithServerKey(options: GeminiRequestOptions): Promise<GeminiExecutionResult> {
  const startTime = Date.now();
  const requestedModel = resolveModelName(options.model);

  // First try the server endpoint (/api/ai/generate) without x-gemini-api-key header
  // so the server (server.ts or Vercel serverless function) uses process.env.GEMINI_API_KEY
  try {
    const res = await fetch(getAiProxyEndpoint('/api/ai/generate'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: requestedModel,
        contents: options.contents,
        systemInstruction: options.systemInstruction,
        responseMimeType: options.responseMimeType,
        responseSchema: options.responseSchema,
        taskType: options.taskType || 'Vercel Server AI',
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      const data = await res.json();
      const fallbackOccurred = Boolean(data.fallbackOccurred);

      recordAILog({
        taskType: options.taskType || 'Vercel Server AI',
        requestedModel: data.requestedModel || requestedModel,
        actualModel: data.actualModel || requestedModel,
        fallbackOccurred,
        attemptedModels: data.attemptedModels || [requestedModel],
        latencyMs: data.latencyMs || latencyMs,
        keySource: 'Server Env',
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
        keySource: 'Server Env',
      };
    }
  } catch (proxyErr) {
    console.warn('[AI Client] Server endpoint call error, checking client env key...', proxyErr);
  }

  // If server endpoint was not reachable (e.g. pure static build without serverless routing),
  // fallback to Vite client env key VITE_GEMINI_API_KEY if configured in Vercel build
  const clientEnvKey =
    import.meta.env.VITE_GEMINI_API_KEY ||
    (typeof process !== 'undefined' ? (process.env?.GEMINI_API_KEY || process.env?.VITE_GEMINI_API_KEY) : '');

  if (clientEnvKey && clientEnvKey.trim()) {
    return runDirectClientLoop(options, clientEnvKey.trim(), 'Vite Client Env', startTime);
  }

  throw new Error(
    'No Gemini API Key available. Please configure GEMINI_API_KEY in Vercel Environment Variables or provide a key in the settings modal.'
  );
}

/**
 * Direct SDK loop with Smart Cascade Fallback
 */
async function runDirectClientLoop(
  options: GeminiRequestOptions,
  apiKey: string,
  keySource: 'User Custom Key' | 'Vite Client Env',
  startTime: number
): Promise<GeminiExecutionResult> {
  const ai = new GoogleGenAI({
    apiKey,
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
      errors.push(`${currentModel}: ${msg}`);

      // If key is invalid or quota exhausted, stop model cascade on this key immediately
      // so caller can failover to Server Key without delay!
      const isKeyOrQuota =
        msg.includes('API_KEY_INVALID') ||
        msg.includes('403') ||
        msg.includes('401') ||
        msg.includes('quota') ||
        msg.includes('429');

      if (isKeyOrQuota) {
        console.warn(`[Direct Client Key Error] Key error on ${keySource}: ${msg}`);
        throw new Error(msg);
      }
    }
  }

  const latencyMs = Date.now() - startTime;

  if (!successfulResponse) {
    const errorMsg = `All models in fallback cascade failed: ${errors.join(' | ')}`;
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
    } catch {}
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
