import React, { useState, useEffect } from 'react';
import { Sparkles, Key, Activity, ChevronUp, Check, Layers, Cpu, ShieldCheck } from 'lucide-react';
import { useAIModels } from '../context/AIModelContext';
import { getShortModelDisplay } from '../utils/aiModelResolver';
import { subscribeToAILogs, hasCustomApiKey, AILogEntry } from '../utils/aiTracker';
import AILogModal from './AILogModal';
import APIKeyModal from './APIKeyModal';

export const FloatingMenu: React.FC = () => {
  const { models, selectedModel, setSelectedModel } = useAIModels();
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [lastLog, setLastLog] = useState<AILogEntry | null>(null);
  const [hasCustomKey, setHasCustomKey] = useState(false);

  useEffect(() => {
    setHasCustomKey(hasCustomApiKey());
    const unsubscribe = subscribeToAILogs((logs) => {
      if (logs.length > 0) {
        setLastLog(logs[0]);
      }
      setHasCustomKey(hasCustomApiKey());
    });
    return unsubscribe;
  }, []);

  // Format dynamic short name
  const display = getShortModelDisplay(selectedModel);

  // Status indicator determination
  let pulseColor = 'bg-emerald-500';
  let pulseRing = 'ring-emerald-400';
  let statusTooltip = 'Dual-Layer Engine: Ready';

  if (lastLog) {
    if (lastLog.status === 'error') {
      pulseColor = 'bg-rose-500';
      pulseRing = 'ring-rose-400';
      statusTooltip = `Error: ${lastLog.taskType}`;
    } else if (lastLog.fallbackOccurred) {
      pulseColor = 'bg-amber-500';
      pulseRing = 'ring-amber-400';
      statusTooltip = `Cascaded to ${lastLog.actualModel}`;
    } else {
      pulseColor = 'bg-emerald-500';
      pulseRing = 'ring-emerald-400';
      statusTooltip = `Success (${lastLog.actualModel})`;
    }
  }

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-slate-200/80 transition-all hover:shadow-2xl">
        {/* Dynamic Model Badge & Quick Picker Trigger */}
        <div className="relative">
          <button
            onClick={() => setIsModelPickerOpen(!isModelPickerOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-xl shadow-xs hover:brightness-110 transition-all cursor-pointer group text-left"
            title="Switch Active Gemini AI Model (Real-time Live Sync)"
          >
            <Cpu className="w-4 h-4 text-indigo-400 shrink-0 group-hover:rotate-12 transition-transform" />
            <div className="flex flex-col leading-tight select-none">
              <span className="text-[11px] font-black tracking-wide text-indigo-200 uppercase">
                {display.line1}
              </span>
              <span className="text-[10px] font-semibold text-slate-300">
                {display.line2 || 'Model'} {display.line3 ? `· ${display.line3}` : ''}
              </span>
            </div>
            <ChevronUp
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ml-1 ${
                isModelPickerOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Quick Model Selector Dropdown */}
          {isModelPickerOpen && (
            <div className="absolute bottom-full right-0 mb-3 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-fade-in">
              <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold">Central AI Models</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Real-time</span>
              </div>

              <div className="max-h-64 overflow-y-auto p-1.5 divide-y divide-slate-100">
                {models.map((m) => {
                  const isSelected = selectedModel === m.modelId;
                  const itemDisplay = getShortModelDisplay(m.name || m.modelId);

                  return (
                    <button
                      key={m.modelId}
                      onClick={() => {
                        setSelectedModel(m.modelId);
                        setIsModelPickerOpen(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between text-xs ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        <div className="truncate">
                          <p className="truncate font-semibold">{m.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">
                            {m.modelId}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {m.isDefaultLevel1 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                            L1
                          </span>
                        )}
                        {m.isDefaultLevel2 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                            L2
                          </span>
                        )}
                        {isSelected && <Check className="w-4 h-4 text-indigo-600 ml-1" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* AI Execution Log Button with Pulsing Status Indicator */}
        <button
          onClick={() => setIsLogModalOpen(true)}
          className="relative p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all hover:scale-105 shadow-xs"
          title={`AI Execution Logs (${statusTooltip})`}
        >
          <Activity className="w-4 h-4 text-indigo-600" />
          <span
            className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${pulseColor} animate-pulse ring-2 ${pulseRing} ring-offset-1`}
          />
        </button>

        {/* API Key Settings Button */}
        <button
          onClick={() => setIsKeyModalOpen(true)}
          className="relative p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all hover:scale-105 shadow-xs"
          title="Configure Personal Gemini API Key"
        >
          <Key className="w-4 h-4 text-slate-600" />
          {hasCustomKey && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-purple-500" />
          )}
        </button>
      </div>

      {/* Modals */}
      <AILogModal isOpen={isLogModalOpen} onClose={() => setIsLogModalOpen(false)} />
      <APIKeyModal isOpen={isKeyModalOpen} onClose={() => setIsKeyModalOpen(false)} />
    </>
  );
};

export default FloatingMenu;
