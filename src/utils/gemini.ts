/**
 * Gemini Utility Bridge
 * 
 * Powered by Dual-Layer Resilient Gemini AI Engine with Smart Cascade Fallback
 */

import { executeGeminiRequest, fileToBase64 } from './geminiClientService';

export const analyzeImage = async (file: File, prompt: string, model: string = 'gemini-3-flash-preview') => {
  const base64Data = await fileToBase64(file);

  const result = await executeGeminiRequest({
    model,
    taskType: 'Image Lab / Document OCR',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: file.type || 'image/jpeg',
          },
        },
        {
          text: prompt,
        },
      ],
    },
    responseMimeType: 'application/json',
  });

  if (result.json) {
    return result.json;
  }

  // Fallback string extraction for JSON array
  let cleanedText = result.text.trim();
  const arrayMatch = cleanedText.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    cleanedText = arrayMatch[0];
  }

  return JSON.parse(cleanedText);
};

export const analyzeImageObject = async (file: File, prompt: string, model: string = 'gemini-3.1-flash-preview') => {
  const base64Data = await fileToBase64(file);

  const result = await executeGeminiRequest({
    model,
    taskType: 'Diagnostic Object OCR',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: file.type || 'image/jpeg',
          },
        },
        {
          text: prompt,
        },
      ],
    },
    responseMimeType: 'application/json',
  });

  if (result.json) {
    return result.json;
  }

  let cleanedText = result.text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(cleanedText);
};

export const generateText = async (prompt: string, model: string = 'gemini-3.1-flash-preview') => {
  const result = await executeGeminiRequest({
    model,
    taskType: 'Text Generation / Analysis',
    contents: {
      parts: [
        {
          text: prompt,
        },
      ],
    },
    responseMimeType: 'application/json',
  });

  if (result.json) {
    return result.json;
  }

  let cleanedText = result.text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(cleanedText);
};

export const extractTextFromImage = async (file: File, prompt: string, model: string = 'gemini-3.1-flash-preview') => {
  const base64Data = await fileToBase64(file);

  const result = await executeGeminiRequest({
    model,
    taskType: 'Note / Document Text Extraction',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: file.type || 'image/jpeg',
          },
        },
        {
          text: prompt,
        },
      ],
    },
  });

  return result.text;
};
