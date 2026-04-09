import { GoogleGenAI } from '@google/genai';

export const analyzeImage = async (file: File, prompt: string, model: string = 'gemini-3-flash-preview') => {
  const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const base64Data = await base64EncodedDataPromise;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: file.type,
          }
        },
        {
          text: prompt
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error('No text returned from Gemini');
  }

  // Clean up the text to extract only the JSON array, ignoring markdown or conversational text
  let cleanedText = text.trim();
  const arrayMatch = cleanedText.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    cleanedText = arrayMatch[0];
  }

  return JSON.parse(cleanedText);
};

export const analyzeImageObject = async (file: File, prompt: string, model: string = 'gemini-3.1-flash-preview') => {
  const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const base64Data = await base64EncodedDataPromise;

  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });
  
  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: file.type,
          }
        },
        {
          text: prompt
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error('No text returned from Gemini');
  }

  let cleanedText = text.trim();
  // Remove markdown code blocks if present
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```\n/, '').replace(/\n```$/, '');
  }

  return JSON.parse(cleanedText);
};

export const generateText = async (prompt: string, model: string = 'gemini-3.1-flash-preview') => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });
  
  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        {
          text: prompt
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error('No text returned from Gemini');
  }

  let cleanedText = text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```\n/, '').replace(/\n```$/, '');
  }

  return JSON.parse(cleanedText);
};

export const extractTextFromImage = async (file: File, prompt: string, model: string = 'gemini-3.1-flash-preview') => {
  const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const base64Data = await base64EncodedDataPromise;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: file.type,
          }
        },
        {
          text: prompt
        }
      ]
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error('No text returned from Gemini');
  }

  return text;
};
