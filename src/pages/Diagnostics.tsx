import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Activity, Plus, Save, X, Upload, Image as ImageIcon, Loader2, Search, Calendar, Filter, Trash2, Edit2, ArrowUpDown, HeartPulse } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import Highlight from '../components/Highlight';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { getThaiDateString, formatThaiDate } from '../utils/dateUtils';

export default function Diagnostics() {
  const { user } = useAuth();
  const { activeProfile, canEdit } = useProfile();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-lite-preview');
  const [selectedDate, setSelectedDate] = useState(getThaiDateString());
  const [selectedNotes, setSelectedNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultRecord = {
    Date: getThaiDateString(),
    Type: 'EKG',
    HeartRate: '',
    Rhythm: '',
    PRInterval: '',
    QRSDuration: '',
    QTc: '',
    Axis: '',
    Interpretation: '',
    Notes: ''
  };

  const [newRecord, setNewRecord] = useState(defaultRecord);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [sortOption, setSortOption] = useState('date_desc');

  useEffect(() => {
    if (user && activeProfile) {
      fetchRecords();
    } else {
      setRecords([]);
      setLoading(false);
    }
  }, [user, activeProfile]);

  const fetchRecords = async () => {
    if (!user || !activeProfile) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'Diagnostics'), where('profileId', '==', activeProfile.id));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecords(data);
    } catch (error) {
      console.error('Failed to fetch records', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeProfile || !canEdit) return;
    setSaving(true);
    setError('');
    
    try {
      const dataToSave = { 
        ...newRecord, 
        profileId: activeProfile.id,
        userId: user.uid
      };
      if (editingRecord) {
        await updateDoc(doc(db, 'Diagnostics', editingRecord.id), dataToSave);
        setIsModalOpen(false);
        setEditingRecord(null);
        setNewRecord(defaultRecord);
        fetchRecords();
      } else {
        await addDoc(collection(db, 'Diagnostics'), dataToSave);
        setIsModalOpen(false);
        setNewRecord(defaultRecord);
        fetchRecords();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingRecord || !user || !canEdit) return;
    
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'Diagnostics', editingRecord.id));
      setConfirmDelete(null);
      setEditingRecord(null);
      setNewRecord(defaultRecord);
      setIsModalOpen(false);
      fetchRecords();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (record: any) => {
    if (!canEdit) return;
    setEditingRecord(record);
    setNewRecord({
      Date: record.Date || getThaiDateString(),
      Type: record.Type || 'EKG',
      HeartRate: record.HeartRate || '',
      Rhythm: record.Rhythm || '',
      PRInterval: record.PRInterval || '',
      QRSDuration: record.QRSDuration || '',
      QTc: record.QTc || '',
      Axis: record.Axis || '',
      Interpretation: record.Interpretation || '',
      Notes: record.Notes || ''
    });
    setConfirmDelete(null);
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canEdit) return;

    setAnalyzing(true);
    setError('');

    try {
      const { analyzeImageObject } = await import('../utils/gemini');
      
      const prompt = `
        Analyze this EKG/ECG image thoroughly.
        CRITICAL INSTRUCTION: DO NOT just read the machine-printed text at the top. You MUST visually analyze the actual EKG waveforms (the graphs) across all leads.
        Look for and report on:
        - P wave morphology and presence
        - RR interval regularity (arrhythmias)
        - ST segment elevation or depression
        - T wave inversions or abnormalities
        - Any signs of blocks, hypertrophy, or ischemia based on the visual graph.
        
        Extract the standard metrics if visible, but prioritize your visual analysis of the graph for the Interpretation and Notes.
        
        Return ONLY a JSON object with these exact keys (no markdown, no extra text):
        {
          "HeartRate": "string (e.g., '75 bpm')",
          "Rhythm": "string (e.g., 'Normal Sinus Rhythm, based on visual check of P waves and QRS')",
          "PRInterval": "string (e.g., '160 ms')",
          "QRSDuration": "string (e.g., '90 ms')",
          "QTc": "string (e.g., '410 ms')",
          "Axis": "string (e.g., 'Normal Axis')",
          "Interpretation": "string (Your detailed visual analysis of the waveforms, e.g., 'ST elevation in leads V1-V3 indicating anterior STEMI. T wave inversion in lead aVL...')",
          "Notes": "string (Any additional findings from the graph, or discrepancies between the printed text and your visual analysis)"
        }
        If a numerical value is not printed and cannot be estimated, return an empty string "" for that key.
      `;

      const result = await analyzeImageObject(file, prompt, selectedModel);
      
      setNewRecord(prev => ({
        ...prev,
        Date: selectedDate,
        Notes: result.Notes ? (selectedNotes ? `${selectedNotes}\n\nAI Visual Analysis:\n${result.Notes}` : result.Notes) : selectedNotes,
        HeartRate: result.HeartRate || prev.HeartRate,
        Rhythm: result.Rhythm || prev.Rhythm,
        PRInterval: result.PRInterval || prev.PRInterval,
        QRSDuration: result.QRSDuration || prev.QRSDuration,
        QTc: result.QTc || prev.QTc,
        Axis: result.Axis || prev.Axis,
        Interpretation: result.Interpretation || prev.Interpretation
      }));
      
      setIsModalOpen(true);
    } catch (err: any) {
      console.error('Error analyzing image:', err);
      setError(err.message || 'Failed to analyze image. Please try again.');
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Filtering and Sorting
  const filteredAndSortedRecords = useMemo(() => {
    let result = [...records];

    if (filterStartDate) {
      result = result.filter(r => r.Date >= filterStartDate);
    }
    if (filterEndDate) {
      result = result.filter(r => r.Date <= filterEndDate);
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(r => 
        (r.Interpretation && r.Interpretation.toLowerCase().includes(lowerQuery)) ||
        (r.Notes && r.Notes.toLowerCase().includes(lowerQuery)) ||
        (r.Rhythm && r.Rhythm.toLowerCase().includes(lowerQuery))
      );
    }

    result.sort((a, b) => {
      const dateA = new Date(a.Date).getTime();
      const dateB = new Date(b.Date).getTime();
      
      if (sortOption === 'date_desc') return dateB - dateA;
      if (sortOption === 'date_asc') return dateA - dateB;
      return 0;
    });

    return result;
  }, [records, searchQuery, filterStartDate, filterEndDate, sortOption]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Please log in</h2>
          <p className="text-slate-600 mb-4">You need to be logged in to view diagnostics.</p>
          <Link to="/login" className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!activeProfile) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">No Profile Selected</h2>
          <p className="text-slate-600 mb-4">Please select or create a profile to view diagnostics.</p>
          <Link to="/profiles" className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
            Manage Profiles
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
              <HeartPulse className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Diagnostics & EKG</h1>
              <p className="text-slate-600">ผลการตรวจพิเศษและคลื่นไฟฟ้าหัวใจ</p>
            </div>
          </div>
          
          {canEdit && (
            <button
              onClick={() => {
                setEditingRecord(null);
                setNewRecord(defaultRecord);
                setConfirmDelete(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors text-sm shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Manual Entry
            </button>
          )}
        </div>
        
        {canEdit && (
          <div className="p-6 border-b border-slate-100 bg-white">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-700 whitespace-nowrap">AI Model:</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={analyzing || saving}
                      className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:opacity-50 max-w-[200px] truncate"
                    >
                      <option value="gemini-3.1-pro-preview">(0) Gemini 3.1 Pro Preview (ฉลาดที่ 1)</option>
                      <option value="gemini-3-pro-preview">(0) Gemini 3.0 Pro Preview (ฉลาดที่ 2)</option>
                      <option value="gemini-2.5-pro">(0) Gemini 2.5 Pro (ฉลาดที่ 3)</option>
                      <option value="gemini-pro-latest">(0) Gemini Pro (Latest Stable) (ฉลาดที่ 4)</option>
                      <option value="gemini-3-flash-preview">(20) Gemini 3 Flash Preview (ฉลาดที่ 5)</option>
                      <option value="gemini-3.1-flash-lite-preview">(500) Gemini 3.1 Flash Lite Preview (ฉลาดที่ 6) (Default)</option>
                      <option value="gemini-flash-latest">(20) Gemini Flash Latest (ฉลาดที่ 7)</option>
                      <option value="gemini-2.5-flash">(20) Gemini 2.5 Flash (ฉลาดที่ 8)</option>
                      <option value="gemini-flash-lite-latest">(500) Gemini Flash Lite Latest (ฉลาดที่ 9)</option>
                      <option value="gemini-2.5-flash-lite">(20) Gemini 2.5 Flash Lite (ฉลาดที่ 10)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Test Date:</label>
                    <input 
                      type="date" 
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      disabled={analyzing || saving}
                      className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Notes:</label>
                  <input 
                    type="text" 
                    value={selectedNotes}
                    onChange={(e) => setSelectedNotes(e.target.value)}
                    disabled={analyzing || saving}
                    placeholder="e.g. Routine checkup, Post-surgery EKG"
                    className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
                  />
                </div>
              </div>
              
              <div className="flex items-end">
                <div className="relative w-full md:w-auto">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={analyzing}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 shadow-sm shadow-indigo-200"
                  >
                    {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span>{analyzing ? 'Analyzing...' : 'Scan EKG'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 rounded-xl flex items-start gap-3 border border-rose-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาคำวินิจฉัย, จังหวะการเต้น, หรือหมายเหตุ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="date_desc">ใหม่สุดไปเก่าสุด</option>
              <option value="date_asc">เก่าสุดไปใหม่สุด</option>
            </select>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="w-5 h-5 text-slate-400" />
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <span className="text-slate-400 hidden sm:inline">ถึง</span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="w-5 h-5 text-slate-400 sm:hidden" />
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          {(filterStartDate || filterEndDate || searchQuery) && (
            <button
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setSearchQuery('');
              }}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* Records List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filteredAndSortedRecords.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <HeartPulse className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">No records found</h3>
            <p className="text-slate-500">
              {records.length === 0 
                ? "ยังไม่มีประวัติการตรวจ EKG กดปุ่ม Scan EKG หรือ Add Manual เพื่อเพิ่มข้อมูล" 
                : "ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา"}
            </p>
          </div>
        ) : (
          filteredAndSortedRecords.map((record) => (
            <div key={record.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-200 transition-colors group">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                        <HeartPulse className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800 text-lg">
                          {record.Type}
                        </h3>
                        <p className="text-sm text-slate-500">{formatThaiDate(record.Date)}</p>
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => startEdit(record)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                        title="Edit Record"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4 bg-slate-50 p-4 rounded-xl">
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Heart Rate</p>
                      <p className="font-medium text-slate-800">{record.HeartRate || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Rhythm</p>
                      <p className="font-medium text-slate-800"><Highlight text={record.Rhythm || '-'} query={searchQuery} /></p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Axis</p>
                      <p className="font-medium text-slate-800">{record.Axis || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">PR Interval</p>
                      <p className="font-medium text-slate-800">{record.PRInterval || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">QRS Duration</p>
                      <p className="font-medium text-slate-800">{record.QRSDuration || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">QTc</p>
                      <p className="font-medium text-slate-800">{record.QTc || '-'}</p>
                    </div>
                  </div>

                  {record.Interpretation && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-slate-700 mb-1">Interpretation (คำวินิจฉัย):</p>
                      <p className="text-slate-800 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50">
                        <Highlight text={record.Interpretation} query={searchQuery} />
                      </p>
                    </div>
                  )}

                  {record.Notes && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-sm font-medium text-slate-700 mb-1">Notes (หมายเหตุ):</p>
                      <p className="text-slate-600 text-sm whitespace-pre-wrap">
                        <Highlight text={record.Notes} query={searchQuery} />
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal for Add/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-xl font-bold text-slate-800">
                {editingRecord ? 'Edit Diagnostic Record' : 'Add Diagnostic Record'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date (วันที่ตรวจ)</label>
                    <input 
                      type="date" 
                      required
                      value={newRecord.Date}
                      onChange={e => setNewRecord({...newRecord, Date: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Type (ประเภทการตรวจ)</label>
                    <input 
                      type="text" 
                      required
                      value={newRecord.Type}
                      onChange={e => setNewRecord({...newRecord, Type: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g., EKG, X-Ray"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Heart Rate</label>
                    <input 
                      type="text" 
                      value={newRecord.HeartRate}
                      onChange={e => setNewRecord({...newRecord, HeartRate: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g., 75 bpm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Rhythm</label>
                    <input 
                      type="text" 
                      value={newRecord.Rhythm}
                      onChange={e => setNewRecord({...newRecord, Rhythm: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g., Normal Sinus Rhythm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">PR Interval</label>
                    <input 
                      type="text" 
                      value={newRecord.PRInterval}
                      onChange={e => setNewRecord({...newRecord, PRInterval: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g., 160 ms"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">QRS Duration</label>
                    <input 
                      type="text" 
                      value={newRecord.QRSDuration}
                      onChange={e => setNewRecord({...newRecord, QRSDuration: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g., 90 ms"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">QTc</label>
                    <input 
                      type="text" 
                      value={newRecord.QTc}
                      onChange={e => setNewRecord({...newRecord, QTc: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g., 410 ms"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Axis</label>
                    <input 
                      type="text" 
                      value={newRecord.Axis}
                      onChange={e => setNewRecord({...newRecord, Axis: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g., Normal Axis"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Interpretation (คำวินิจฉัย)</label>
                  <textarea 
                    value={newRecord.Interpretation}
                    onChange={e => setNewRecord({...newRecord, Interpretation: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[100px]"
                    placeholder="e.g., Normal ECG, No acute changes"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes (หมายเหตุ)</label>
                  <textarea 
                    value={newRecord.Notes}
                    onChange={e => setNewRecord({...newRecord, Notes: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[100px]"
                    placeholder="Add any additional notes here..."
                  />
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex-shrink-0 flex flex-col-reverse sm:flex-row items-center justify-between gap-4 bg-slate-50 rounded-b-2xl">
                {editingRecord ? (
                  <div className="w-full sm:w-auto">
                    {confirmDelete === editingRecord.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-rose-600 font-medium">Are you sure?</span>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={saving}
                          className="px-3 py-1.5 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 transition-colors"
                        >
                          Yes, Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          disabled={saving}
                          className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(editingRecord.id)}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors font-medium"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete Record
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="hidden sm:block"></div>
                )}
                
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 sm:flex-none px-6 py-2 text-slate-600 font-medium hover:bg-slate-200 bg-white border border-slate-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 shadow-sm shadow-indigo-200"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Save Record
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
