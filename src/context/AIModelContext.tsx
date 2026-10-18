import React, { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, onSnapshot, query, where } from 'firebase/firestore';
import { resolveModelName } from '../utils/aiModelResolver';

export interface AIModelItem {
  id: string;
  modelId: string;
  name: string;
  category: string;
  isActive: boolean;
  isDefaultLevel1?: boolean;
  isDefaultLevel2?: boolean;
  order: number;
}

const centralFirebaseConfig = {
  projectId: "gen-lang-client-0014422363",
  appId: "1:978227936883:web:946402bf6886970bc77406",
  apiKey: "AIzaSyAJLNrYkuTt16qs034UlkEBJrMvlrNCnA4",
  authDomain: "gen-lang-client-0014422363.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-29f335c3-c8ac-451f-97d7-9c310736d1d9",
  storageBucket: "gen-lang-client-0014422363.firebasestorage.app",
  messagingSenderId: "978227936883",
  measurementId: ""
};

const centralApp = getApps().find(app => app.name === 'central-ai-models-app')
  || initializeApp(centralFirebaseConfig, 'central-ai-models-app');

const centralDb = getFirestore(centralApp, centralFirebaseConfig.firestoreDatabaseId);

const FALLBACK_MODELS: AIModelItem[] = [
  { id: '1', modelId: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 1 },
  { id: '2', modelId: 'gemini-3.6-flash', name: '(20)Gemini 3.6 Flash', category: 'text_reasoning', isActive: true, isDefaultLevel1: true, order: 2 },
  { id: '3', modelId: 'gemini-3.5-flash', name: '(20)Gemini 3.5 Flash', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 3 },
  { id: '4', modelId: 'gemini-3-flash-preview', name: '(20)Gemini 3 Flash Preview', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 4 },
  { id: '5', modelId: 'gemini-3.1-pro-preview', name: '(0)Gemini 3.1 Pro Preview', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 5 },
  { id: '6', modelId: 'gemini-3.5-flash-lite', name: '(500)Gemini 3.5 Flash Lite', category: 'text_reasoning', isActive: true, isDefaultLevel2: true, order: 6 },
  { id: '7', modelId: 'gemini-3.1-flash-lite', name: '(500)Gemini 3.1 Flash Lite', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 7 },
  { id: '8', modelId: 'gemini-flash-latest', name: 'Gemini Flash Latest', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 8 },
  { id: '9', modelId: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 9 },
  { id: '10', modelId: 'gemini-2.5-flash', name: '(20)Gemini 2.5 Flash', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 10 },
  { id: '11', modelId: 'gemini-2.5-flash-lite', name: '(20)Gemini 2.5 Flash Lite', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 11 },
  { id: '12', modelId: 'gemini-2.5-pro', name: '(0)Gemini 2.5 Pro', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 12 },
  { id: '13', modelId: 'gemini-pro-latest', name: 'Gemini Pro (Latest Stable)', category: 'text_reasoning', isActive: true, isDefaultLevel1: false, order: 13 },
];

interface AIModelContextType {
  models: AIModelItem[];
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  defaultLevel1ModelId: string;
  defaultLevel2ModelId: string;
  getModelsByCategory: (category: string) => AIModelItem[];
  getDefaultModelForCategory: (category: string, level?: 1 | 2) => string;
  loading: boolean;
}

const AIModelContext = createContext<AIModelContextType>({
  models: FALLBACK_MODELS,
  selectedModel: 'gemini-3.6-flash',
  setSelectedModel: () => {},
  defaultLevel1ModelId: 'gemini-3.6-flash',
  defaultLevel2ModelId: 'gemini-3.5-flash-lite',
  getModelsByCategory: () => FALLBACK_MODELS,
  getDefaultModelForCategory: () => 'gemini-3.6-flash',
  loading: false,
});

export const AIModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<AIModelItem[]>(FALLBACK_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.6-flash');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let unsubscribe: () => void = () => {};
    try {
      const q = query(
        collection(centralDb, 'ai_models'),
        where('isActive', '==', true)
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: AIModelItem[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            const rawModelId = data.modelId || doc.id;
            const modelId = resolveModelName(rawModelId);
            list.push({
              id: doc.id,
              modelId: modelId,
              name: data.name || data.modelId || doc.id,
              category: data.category || 'text_reasoning',
              isActive: data.isActive ?? true,
              isDefaultLevel1: !!(data.isDefaultLevel1 || data.level1Default || data.isLevel1Default),
              isDefaultLevel2: !!(data.isDefaultLevel2 || data.level2Default || data.isLevel2Default),
              order: typeof data.order === 'number' ? data.order : 999,
            });
          });

          if (list.length > 0) {
            // Deduplicate by modelId to eliminate React duplicate key warnings and double renders
            const seen = new Set<string>();
            const deduplicated: AIModelItem[] = [];
            for (const item of list) {
              const key = item.modelId.toLowerCase();
              if (!seen.has(key)) {
                seen.add(key);
                deduplicated.push(item);
              }
            }

            deduplicated.sort((a, b) => a.order - b.order);
            setModels(deduplicated);

            // If selectedModel is not initialized or invalid, set to Level 1 default
            const level1 = deduplicated.find((m) => m.isDefaultLevel1)?.modelId || deduplicated[0]?.modelId;
            if (level1) {
              setSelectedModel((prev) => (prev && deduplicated.some((m) => m.modelId === prev) ? prev : level1));
            }
          }
          setLoading(false);
        },
        (error) => {
          console.warn('Central ai_models Firestore error, using fallback models:', error);
          setLoading(false);
        }
      );
    } catch (err) {
      console.warn('Failed to subscribe to central ai_models:', err);
      setLoading(false);
    }

    return () => unsubscribe();
  }, []);

  const getModelsByCategory = (category: string): AIModelItem[] => {
    const filtered = models.filter((m) => m.category === category);
    if (filtered.length > 0) return filtered;
    if (category === 'text_reasoning') {
      return models.filter((m) => m.category === 'text_reasoning' || !m.category);
    }
    return filtered;
  };

  const getDefaultModelForCategory = (category: string, level: 1 | 2 = 1): string => {
    const catModels = getModelsByCategory(category);
    if (catModels.length === 0) return 'gemini-3.6-flash';

    const defaultProp = level === 2 ? 'isDefaultLevel2' : 'isDefaultLevel1';
    const match = catModels.find((m) => m[defaultProp]);
    if (match) return match.modelId;

    return catModels[0].modelId;
  };

  const textModels = getModelsByCategory('text_reasoning');
  const defaultLevel1ModelId =
    textModels.find((m) => m.isDefaultLevel1)?.modelId || textModels[0]?.modelId || 'gemini-3.6-flash';
  const defaultLevel2ModelId =
    textModels.find((m) => m.isDefaultLevel2)?.modelId ||
    textModels.find((m) => m.modelId.includes('lite'))?.modelId ||
    'gemini-3.5-flash-lite';

  return (
    <AIModelContext.Provider
      value={{
        models,
        selectedModel,
        setSelectedModel,
        defaultLevel1ModelId,
        defaultLevel2ModelId,
        getModelsByCategory,
        getDefaultModelForCategory,
        loading,
      }}
    >
      {children}
    </AIModelContext.Provider>
  );
};

export const useAIModels = () => useContext(AIModelContext);
