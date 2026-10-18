import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import resolver logic for fallback list
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

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Increase payload limit to support base64 images (lab results, prescription photos)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      engine: 'Dual-Layer Resilient Gemini AI Engine'
    });
  });

  // Test custom API Key endpoint
  app.post('/api/ai/test-key', async (req: Request, res: Response) => {
    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;
    const keyToTest = customKey || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!keyToTest) {
      return res.status(400).json({
        success: false,
        message: 'No API key provided or found in environment.'
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: keyToTest,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      // Quick ping test
      const result = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: 'Reply with "OK"'
      });

      return res.json({
        success: true,
        message: 'API Key is valid and working!',
        text: result.text?.trim()
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to validate API key with Gemini API'
      });
    }
  });

  // Primary resilient generate endpoint with Smart Cascade Fallback
  app.post('/api/ai/generate', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const {
      model,
      contents,
      systemInstruction,
      responseMimeType,
      responseSchema,
      taskType = 'General AI Request'
    } = req.body;

    // Multi-source key resolution with Priority:
    // Priority 1: Client-Provided Key (Local Storage via header 'x-gemini-api-key')
    // Priority 2: Server Environment Key (GEMINI_API_KEY from server / Vercel)
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
        error: 'No Gemini API Key available. Please configure GEMINI_API_KEY on server or provide a custom key.'
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
          break; // Model success
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          errors.push({ model: currentModel, error: errMsg, keySource: currentKeyObj.source });

          // If error is an API Key or Quota failure, break immediately and fail over to server key!
          const isKeyOrQuotaError =
            errMsg.includes('API_KEY_INVALID') ||
            errMsg.includes('403') ||
            errMsg.includes('401') ||
            errMsg.includes('API key not valid') ||
            errMsg.includes('Resource has been exhausted') ||
            errMsg.includes('quota') ||
            errMsg.includes('429');

          if (isKeyOrQuotaError && keyIdx < keysToTry.length - 1) {
            console.warn(`[AI Key Cascade] Key from ${currentKeyObj.source} encountered key/quota error (${errMsg}). Auto-failing over to Server API Key...`);
            keyFailoverOccurred = true;
            keyFailoverReason = `Priority 1 (${currentKeyObj.source}) failed: ${errMsg}`;
            break; // Break model loop to advance to next key
          } else {
            console.warn(`[AI Engine Cascade] Model ${currentModel} failed: ${errMsg}. Trying fallback...`);
          }
        }
      }

      if (keySucceeded) {
        break; // Stop trying keys
      }

      if (!keySucceeded && keyIdx < keysToTry.length - 1) {
        keyFailoverOccurred = true;
        keyFailoverReason = `All models failed on ${currentKeyObj.source}`;
        console.warn(`[AI Key Cascade] All models failed on ${currentKeyObj.source}. Auto-failing over to Server API Key...`);
      }
    }

    const latencyMs = Date.now() - startTime;

    if (!successfulResponse) {
      console.error('[AI Engine Cascade] All models and keys in cascade failed:', errors);
      return res.status(502).json({
        error: 'All AI models and API keys in fallback cascade failed.',
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
        // Leave parsedJson as null if pure text
      }
    }

    return res.json({
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
  });

  // Mount Vite or static server
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dual-Layer Resilient Gemini Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
