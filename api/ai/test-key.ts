import { GoogleGenAI } from '@google/genai';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
}
