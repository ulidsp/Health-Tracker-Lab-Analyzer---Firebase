import React, { useEffect } from 'react';
import { useAIModels } from '../context/AIModelContext';

interface AIModelSelectProps {
  value: string;
  onChange: (modelId: string) => void;
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
  const { getModelsByCategory, getDefaultModelForCategory, loading } = useAIModels();
  const categoryModels = getModelsByCategory(category);
  const defaultModelId = getDefaultModelForCategory(category, level);

  useEffect(() => {
    if (!loading && defaultModelId) {
      if (!value || !categoryModels.some(m => m.modelId === value)) {
        onChange(defaultModelId);
      }
    }
  }, [defaultModelId, loading]);

  if (categoryModels.length === 0) {
    return null;
  }

  return (
    <select
      value={value || defaultModelId}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
    >
      {categoryModels.map((m) => (
        <option key={m.id || m.modelId} value={m.modelId}>
          {m.name}
        </option>
      ))}
    </select>
  );
};

export default AIModelSelect;
