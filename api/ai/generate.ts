import { GoogleGenAI } from '@google/genai';

const DEPRECATED_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
]);

function serverResolveModel(requestedModel?: string): string {
  if (!requestedModel) return 'gemini-3.6-flash';
  const clean = requestedModel.trim().toLowerCase().replace(/^models\//, '');
  if (DEPRECATED_MODELS.has(clean)) return 'gemini-3.6-flash';
  if (clean === 'gemini flash') return 'gemini-flash-latest';
  if (clean === 'gemini lite' || clean === 'flash lite') return 'gemini-3.1-flash-lite';
  if (clean === 'gemini pro') return 'gemini-4-argon';
  return clean;
}

function serverBuildFallbackList(primary: string): string[] {
  const target = serverResolveModel(primary);
  const list: string[] = [target];

  const isLite = target.includes('lite');
  const isPro = target.includes('pro') || target.includes('argon');

  if (isLite) {
    list.push('gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest');
  } else if (isPro) {
    list.push('gemini-4-argon', 'gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-pro-latest');
  } else {
    list.push(
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-flash-latest'
    );
  }

  list.push('gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite');
  return list.filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);
}

export default async function handler(req: any, res: any) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const {
    model,
    contents,
    systemInstruction,
    responseMimeType,
    responseSchema,
    taskType = 'General AI Request'
  } = body;

  // Two-Tier Key Priority Resolution:
  // Priority 1: Browser Local Storage Key (via header x-gemini-api-key)
  // Priority 2: Vercel Server Environment Key (process.env.GEMINI_API_KEY)
  const clientProvidedKey = (req.headers['x-gemini-api-key'] as string | undefined)?.trim();
  const serverKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY)?.trim();

  const keysToTry: Array<{ key: string; source: 'User Custom Key' | 'Server Env' }> = [];
  if (clientProvidedKey) {
    keysToTry.push({ key: clientProvidedKey, source: 'User Custom Key' });
  }
  if (serverKey && serverKey !== clientProvidedKey) {
    keysToTry.push({ key: serverKey, source: 'Server Env' });
  }

  if (keysToTry.length === 0) {
    return res.status(500).json({
      error: 'No Gemini API Key found. Please set GEMINI_API_KEY in Vercel project environment variables or enter a custom key.'
    });
  }

  const requestedModel = serverResolveModel(model);
  const modelsToTry = serverBuildFallbackList(requestedModel);
  const attemptedModels: string[] = [];
  const errors: Array<{ model: string; error: string; keySource: string }> = [];

  let successfulResponse: any = null;
  let actualModelUsed = '';
  let finalKeySource: 'User Custom Key' | 'Server Env' = keysToTry[0].source;
  let keyFailoverOccurred = false;
  let keyFailoverReason: string | undefined = undefined;

  for (let keyIdx = 0; keyIdx < keysToTry.length; keyIdx++) {
    const currentKeyObj = keysToTry[keyIdx];
    const ai = new GoogleGenAI({
      apiKey: currentKeyObj.key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    let keySucceeded = false;

    for (const currentModel of modelsToTry) {
      attemptedModels.push(currentModel);
      try {
        const config: Record<string, any> = {};
        if (systemInstruction) config.systemInstruction = systemInstruction;
        if (responseMimeType) config.responseMimeType = responseMimeType;
        if (responseSchema) config.responseSchema = responseSchema;

        const response = await ai.models.generateContent({
          model: currentModel,
          contents: contents,
          config: Object.keys(config).length > 0 ? config : undefined
        });

        successfulResponse = response;
        actualModelUsed = currentModel;
        finalKeySource = currentKeyObj.source;
        keySucceeded = true;
        break;
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        errors.push({ model: currentModel, error: errMsg, keySource: currentKeyObj.source });

        // Check if error is due to bad key or quota exhaustion
        const isKeyOrQuotaError =
          errMsg.includes('API_KEY_INVALID') ||
          errMsg.includes('403') ||
          errMsg.includes('401') ||
          errMsg.includes('API key not valid') ||
          errMsg.includes('Resource has been exhausted') ||
          errMsg.includes('quota') ||
          errMsg.includes('429');

        if (isKeyOrQuotaError && keyIdx < keysToTry.length - 1) {
          console.warn(`[Vercel Key Cascade] Key from ${currentKeyObj.source} encountered error (${errMsg}). Auto-failing over to Vercel Server Key...`);
          keyFailoverOccurred = true;
          keyFailoverReason = `Priority 1 (${currentKeyObj.source}) failed: ${errMsg}`;
          break; // Try next key
        }
      }
    }

    if (keySucceeded) {
      break;
    }

    if (!keySucceeded && keyIdx < keysToTry.length - 1) {
      keyFailoverOccurred = true;
      keyFailoverReason = `All models failed on ${currentKeyObj.source}`;
      console.warn(`[Vercel Key Cascade] All models failed on ${currentKeyObj.source}. Auto-failing over to Vercel Server Key...`);
    }
  }

  const latencyMs = Date.now() - startTime;

  if (!successfulResponse) {
    return res.status(502).json({
      error: 'All AI models and API keys in cascade fallback failed.',
      requestedModel,
      attemptedModels,
      errors,
      latencyMs,
      keySource: finalKeySource,
      keyFailoverOccurred,
      keyFailoverReason
    });
  }

  const rawText = successfulResponse.text || '';
  let parsedJson: any = null;

  if (responseMimeType === 'application/json' || rawText.includes('{') || rawText.includes('[')) {
    try {
      let cleanText = rawText.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      parsedJson = JSON.parse(cleanText);
    } catch {
      // Ignored
    }
  }

  return res.status(200).json({
    text: rawText,
    json: parsedJson,
    actualModel: actualModelUsed,
    requestedModel,
    fallbackOccurred: actualModelUsed !== requestedModel,
    attemptedModels,
    latencyMs,
    keySource: finalKeySource,
    keyFailoverOccurred,
    keyFailoverReason,
    taskType
  });
}
