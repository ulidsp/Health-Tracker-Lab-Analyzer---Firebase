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

    // Multi-source key resolution
    const clientProvidedKey = req.headers['x-gemini-api-key'] as string | undefined;
    const serverKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    let effectiveKey = '';
    let keySource: 'User Custom Key' | 'Server Env' = 'Server Env';

    if (clientProvidedKey && clientProvidedKey.trim()) {
      effectiveKey = clientProvidedKey.trim();
      keySource = 'User Custom Key';
    } else if (serverKey) {
      effectiveKey = serverKey.trim();
      keySource = 'Server Env';
    }

    if (!effectiveKey) {
      return res.status(500).json({
        error: 'No Gemini API Key available. Please configure GEMINI_API_KEY on server or provide a custom key.'
      });
    }

    const ai = new GoogleGenAI({
      apiKey: effectiveKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const requestedModel = serverResolveModel(model);
    const modelsToTry = serverBuildFallbackList(requestedModel);
    const attemptedModels: string[] = [];
    const errors: Array<{ model: string; error: string }> = [];

    let successfulResponse: any = null;
    let actualModelUsed = '';

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
        break; // Successfully got response, stop trying fallbacks
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.warn(`[AI Engine Cascade] Model ${currentModel} failed: ${errMsg}. Trying fallback...`);
        errors.push({ model: currentModel, error: errMsg });
      }
    }

    const latencyMs = Date.now() - startTime;

    if (!successfulResponse) {
      console.error('[AI Engine Cascade] All models in cascade failed:', errors);
      return res.status(502).json({
        error: 'All AI models in fallback cascade failed.',
        requestedModel,
        attemptedModels,
        errors,
        latencyMs,
        keySource
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
      keySource,
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
