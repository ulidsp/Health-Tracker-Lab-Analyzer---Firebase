import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Key, Activity, Check, Layers, Cpu, ArrowUpToLine, ArrowUp, ArrowDown, GripHorizontal, RotateCcw } from 'lucide-react';
import { useAIModels } from '../context/AIModelContext';
import { getShortModelDisplay } from '../utils/aiModelResolver';
import { subscribeToAILogs, hasCustomApiKey, AILogEntry } from '../utils/aiTracker';
import AILogModal from './AILogModal';
import APIKeyModal from './APIKeyModal';

interface FloatingMenuProps {
  onScrollToTop?: () => void;
  onScrollToContent?: () => void;
  onScrollToBottom?: () => void;
  showScrollBottom?: boolean;
}

export const FloatingMenu: React.FC<FloatingMenuProps> = ({
  onScrollToTop,
  onScrollToContent,
  onScrollToBottom,
  showScrollBottom = false,
}) => {
  const { getModelsByCategory, selectedModel, setSelectedModel } = useAIModels();
  const textModels = getModelsByCategory('text_reasoning');
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [lastLog, setLastLog] = useState<AILogEntry | null>(null);
  const [hasCustomKey, setHasCustomKey] = useState(false);

  // Dragging state (in-memory only; resets automatically upon page refresh)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

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

  // Ensure position stays within viewport on screen resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev || !stackRef.current) return prev;
        const rect = stackRef.current.getBoundingClientRect();
        return {
          x: Math.max(8, Math.min(prev.x, window.innerWidth - rect.width - 8)),
          y: Math.max(8, Math.min(prev.y, window.innerHeight - rect.height - 8)),
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Pointer drag handlers (supports Desktop Mouse and Mobile/Tablet Touch)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only primary button
    const element = stackRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: rect.left,
      initialY: rect.top,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current || !stackRef.current) return;

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    const rect = stackRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const newX = Math.max(8, Math.min(dragStartRef.current.initialX + dx, window.innerWidth - width - 8));
    const newY = Math.max(8, Math.min(dragStartRef.current.initialY + dy, window.innerHeight - height - 8));

    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleResetPosition = () => {
    setPosition(null);
  };

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

  // Detect whether the floating stack is currently on the left half of the screen
  const isLeftSide = position ? position.x < window.innerWidth / 2 : false;

  return (
    <>
      {/* Draggable Vertical Floating Control Stack */}
      <div
        ref={stackRef}
        className={`fixed z-50 flex flex-col items-center gap-2 select-none ${
          isDragging ? 'cursor-grabbing opacity-90 scale-[1.02]' : ''
        } ${!position ? 'right-3 sm:right-5 md:right-7' : ''}`}
        style={
          position
            ? {
                left: `${position.x}px`,
                top: `${position.y}px`,
                right: 'auto',
                bottom: 'auto',
              }
            : {
                bottom: 'max(1.75rem, env(safe-area-inset-bottom, 1.75rem))',
              }
        }
      >
        {/* Tactile Drag Handle Pill */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleResetPosition}
          className="w-10 h-4 bg-slate-200/90 hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors shadow-xs touch-none group"
          title="แตะหรือคลิกค้างเพื่อลากย้ายตำแหน่ง (ดับเบิลคลิกเพื่อคืนค่าเดิม)"
        >
          <GripHorizontal className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100" />
        </div>

        {/* Scroll Shortcut 1: Scroll to Top */}
        {onScrollToTop && (
          <button
            onClick={onScrollToTop}
            className="w-11 h-11 sm:w-12 sm:h-12 bg-white text-slate-700 rounded-full shadow-lg hover:bg-slate-50 border border-slate-200 transition-all hover:scale-105 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-slate-400"
            title="Scroll to very top (Header)"
          >
            <ArrowUpToLine className="w-5 h-5" />
          </button>
        )}

        {/* Scroll Shortcut 2: Scroll to Content Top */}
        {onScrollToContent && (
          <button
            onClick={onScrollToContent}
            className="w-11 h-11 sm:w-12 sm:h-12 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all hover:scale-105 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="Scroll to content top"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        )}

        {/* Scroll Shortcut 3: Scroll to Latest (Chat Only) */}
        {showScrollBottom && onScrollToBottom && (
          <button
            onClick={onScrollToBottom}
            className="w-11 h-11 sm:w-12 sm:h-12 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transition-all hover:scale-105 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
            title="Scroll to latest message"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        )}

        {/* Subtle Separator */}
        <div className="w-6 h-px bg-slate-300/80 my-0.5" />

        {/* AI Model Badge & Quick Picker */}
        <div className="relative">
          <button
            onClick={() => setIsModelPickerOpen(!isModelPickerOpen)}
            className="flex flex-col items-center justify-center w-11 sm:w-12 py-1.5 px-1 bg-gradient-to-b from-slate-900 to-indigo-950 text-white rounded-2xl shadow-lg border border-slate-700 hover:scale-105 hover:brightness-110 transition-all cursor-pointer group"
            title={`Active Gemini Model: ${selectedModel} (Click to switch)`}
          >
            <div className="flex items-center gap-0.5">
              <Cpu className="w-3 h-3 text-indigo-400 shrink-0 group-hover:rotate-12 transition-transform" />
              <span className="text-[11px] font-black tracking-tight text-indigo-200">
                {display.line1}
              </span>
            </div>
            <span className="text-[8.5px] font-bold text-slate-300 leading-none mt-0.5 max-w-[42px] truncate text-center">
              {display.line2 || 'Model'}
            </span>
          </button>

          {/* Quick Model Selector Popover (Opens towards screen center) */}
          {isModelPickerOpen && (
            <div
              className={`absolute bottom-0 w-72 max-w-[85vw] max-h-[65vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 flex flex-col animate-fade-in ${
                isLeftSide ? 'left-full ml-3' : 'right-full mr-3'
              }`}
            >
              <div className="p-3 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold">Text Reasoning Models</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Real-time</span>
              </div>

              <div className="overflow-y-auto p-1.5 divide-y divide-slate-100 flex-1">
                {textModels.map((m) => {
                  const isSelected = selectedModel === m.modelId;

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
          className="relative w-11 h-11 sm:w-12 sm:h-12 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl shadow-md border border-slate-200 transition-all hover:scale-105 flex items-center justify-center focus:outline-none"
          title={`AI Execution Logs (${statusTooltip})`}
        >
          <Activity className="w-5 h-5 text-indigo-600" />
          <span
            className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${pulseColor} animate-pulse ring-2 ${pulseRing} ring-offset-1`}
          />
        </button>

        {/* API Key Settings Button */}
        <button
          onClick={() => setIsKeyModalOpen(true)}
          className="relative w-11 h-11 sm:w-12 sm:h-12 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl shadow-md border border-slate-200 transition-all hover:scale-105 flex items-center justify-center focus:outline-none"
          title="Configure Personal Gemini API Key"
        >
          <Key className="w-5 h-5 text-slate-600" />
          {hasCustomKey && (
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-purple-500 ring-2 ring-purple-300" />
          )}
        </button>

        {/* Position Reset Button (Appears only when user has manually moved the menu) */}
        {position !== null && (
          <button
            onClick={handleResetPosition}
            className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center shadow-xs transition-all hover:scale-110"
            title="คืนค่าตำแหน่งเริ่มต้น"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Modals */}
      <AILogModal isOpen={isLogModalOpen} onClose={() => setIsLogModalOpen(false)} />
      <APIKeyModal isOpen={isKeyModalOpen} onClose={() => setIsKeyModalOpen(false)} />
    </>
  );
};

export default FloatingMenu;
