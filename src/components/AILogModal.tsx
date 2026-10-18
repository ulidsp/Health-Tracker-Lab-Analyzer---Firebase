import React, { useState, useEffect } from 'react';
import { Activity, X, Trash2, ArrowRight, CheckCircle2, AlertTriangle, XCircle, Clock, Key, ShieldCheck, Zap } from 'lucide-react';
import { subscribeToAILogs, clearAILogs, AILogEntry } from '../utils/aiTracker';

interface AILogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AILogModal: React.FC<AILogModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<AILogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'fallback' | 'error'>('all');

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = subscribeToAILogs((newLogs) => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, [isOpen]);

  if (!isOpen) return null;

  const totalCalls = logs.length;
  const fallbackCount = logs.filter((l) => l.fallbackOccurred).length;
  const errorCount = logs.filter((l) => l.status === 'error').length;
  const successCount = logs.filter((l) => l.status === 'success' || l.status === 'fallback_success').length;
  const avgLatency =
    totalCalls > 0
      ? Math.round(logs.reduce((acc, curr) => acc + (curr.latencyMs || 0), 0) / totalCalls)
      : 0;

  const filteredLogs = logs.filter((log) => {
    if (filter === 'fallback') return log.fallbackOccurred;
    if (filter === 'error') return log.status === 'error';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                Gemini AI Engine Execution Tracker
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                  Live Audit
                </span>
              </h3>
              <p className="text-xs text-slate-400">Smart cascade fallback history and performance metrics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {logs.length > 0 && (
              <button
                onClick={clearAILogs}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                title="Clear Logs"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Overview KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Calls</span>
            <span className="text-xl font-extrabold text-slate-900">{totalCalls}</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Success Rate</span>
            <span className="text-xl font-extrabold text-emerald-600">
              {totalCalls > 0 ? `${Math.round((successCount / totalCalls) * 100)}%` : '100%'}
            </span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Cascade Fallbacks</span>
            <span className={`text-xl font-extrabold ${fallbackCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {fallbackCount}
            </span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Avg Latency</span>
            <span className="text-xl font-extrabold text-indigo-600">{avgLatency} ms</span>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All ({logs.length})
            </button>
            <button
              onClick={() => setFilter('fallback')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filter === 'fallback'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-600 hover:bg-amber-50'
              }`}
            >
              Fallbacks ({fallbackCount})
            </button>
            <button
              onClick={() => setFilter('error')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filter === 'error'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-600 hover:bg-rose-50'
              }`}
            >
              Errors ({errorCount})
            </button>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {filteredLogs.length} entries shown
          </span>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-30 text-indigo-500" />
              <p className="text-sm font-medium">No AI execution logs recorded yet</p>
              <p className="text-xs text-slate-400 mt-1">Actions using AI will display their cascade trace here.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isFallback = log.fallbackOccurred;
              const isError = log.status === 'error';

              return (
                <div
                  key={log.id}
                  className={`p-3.5 rounded-xl bg-white border transition-all ${
                    isError
                      ? 'border-rose-200 shadow-rose-50/50'
                      : isFallback
                      ? 'border-amber-200 shadow-amber-50/50'
                      : 'border-slate-200'
                  } shadow-xs hover:shadow-sm`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {isError ? (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      ) : isFallback ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                      <div>
                        <span className="text-xs font-bold text-slate-900">{log.taskType}</span>
                        <span className="text-[10px] text-slate-400 ml-2 font-mono">{log.timestamp}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="flex items-center gap-1 font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {log.latencyMs}ms
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                          log.keySource === 'User Custom Key'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-indigo-50 text-indigo-700'
                        }`}
                      >
                        {log.keySource}
                      </span>
                    </div>
                  </div>

                  {/* Model Cascade Trail */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-500 text-[11px]">Model:</span>
                    <span className="font-mono px-2 py-0.5 bg-slate-100 text-slate-800 rounded text-[11px]">
                      {log.requestedModel}
                    </span>

                    {isFallback && (
                      <>
                        <ArrowRight className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="font-mono px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded text-[11px] flex items-center gap-1">
                          {log.actualModel}
                          <span className="text-[9px] bg-amber-200 text-amber-900 px-1 rounded uppercase">Cascade Active</span>
                        </span>
                      </>
                    )}

                    {log.attemptedModels && log.attemptedModels.length > 1 && (
                      <span className="text-[10px] text-slate-400 ml-auto">
                        Tried: {log.attemptedModels.join(' → ')}
                      </span>
                    )}
                  </div>

                  {/* Error Message */}
                  {log.errorMessage && (
                    <div className="mt-2 p-2 bg-rose-50 rounded-lg text-rose-800 text-[11px] font-mono break-all border border-rose-100">
                      {log.errorMessage}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default AILogModal;
