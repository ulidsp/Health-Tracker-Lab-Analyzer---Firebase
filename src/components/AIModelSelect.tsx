import React, { useEffect } from 'react';
import { useAIModels } from '../context/AIModelContext';

interface AIModelSelectProps {
  value?: string;
  onChange?: (modelId: string) => void;
  category?: string;
  level?: 1 | 2;
  disabled?: boolean;
  className?: string;
}

export const AIModelSelect: React.FC<AIModelSelectProps> = ({
  value,
  onChange,
  category = 'text_reasoning',
  level = 1,
  disabled = false,
  className = "px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
}) => {
  const {
    getModelsByCategory,
    getDefaultModelForCategory,
    selectedModel: contextSelectedModel,
    setSelectedModel: setContextSelectedModel,
    loading
  } = useAIModels();

  const categoryModels = getModelsByCategory(category);
  const defaultModelId = getDefaultModelForCategory(category, level);

  // Use either the explicit controlled value or context selectedModel
  const effectiveValue = value !== undefined ? value : contextSelectedModel;

  const handleChange = (newModelId: string) => {
    if (onChange) {
      onChange(newModelId);
    }
    setContextSelectedModel(newModelId);
  };

  useEffect(() => {
    if (!loading && defaultModelId) {
      if (!effectiveValue || !categoryModels.some(m => m.modelId === effectiveValue)) {
        handleChange(defaultModelId);
      }
    }
  }, [defaultModelId, loading]);

  if (categoryModels.length === 0) {
    return null;
  }

  return (
    <select
      value={effectiveValue || defaultModelId}
      onChange={(e) => handleChange(e.target.value)}
      disabled={disabled}
      className={className}
    >
      {categoryModels.map((m) => (
        <option key={m.modelId} value={m.modelId}>
          {m.name}
        </option>
      ))}
    </select>
  );
};

export default AIModelSelect;
