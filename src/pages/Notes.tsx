import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StickyNote, Plus, Save, X, Upload, Image as ImageIcon, Loader2, Search, Calendar, Filter, Trash2, Edit2, ArrowUpDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import Highlight from '../components/Highlight';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { getThaiDateString, formatThaiDate } from '../utils/dateUtils';

export default function Notes() {
  const { user } = useAuth();
  const { activeProfile, canEdit } = useProfile();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultNote = {
    date: getThaiDateString(),
    title: '',
    content: ''
  };

  const [newNote, setNewNote] = useState(defaultNote);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [sortOption, setSortOption] = useState('date_desc');

  useEffect(() => {
    if (user && activeProfile) {
      fetchNotes();
    } else {
      setNotes([]);
      setLoading(false);
    }
  }, [user, activeProfile]);

  const fetchNotes = async () => {
    if (!user || !activeProfile) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'Notes'), where('profileId', '==', activeProfile.id));
      const snapshot = await getDocs(q).catch(err => handleFirestoreError(err, OperationType.LIST, 'Notes')) as any;
      const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      setNotes(data);
    } catch (error) {
      console.error('Failed to fetch notes', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeProfile || !canEdit) return;
    if (!newNote.title.trim()) {
      setError('กรุณากรอกหัวข้อบันทึก');
      return;
    }
    setSaving(true);
    setError('');
    
    try {
      const dataToSave = { 
        ...newNote, 
        profileId: activeProfile.id,
        userId: user.uid
      };
      if (editingNote) {
        // Update existing
        await updateDoc(doc(db, 'Notes', editingNote.id), dataToSave);
        setIsModalOpen(false);
        setEditingNote(null);
        setNewNote(defaultNote);
        fetchNotes();
      } else {
        // Create new
        await addDoc(collection(db, 'Notes'), dataToSave);
        setIsModalOpen(false);
        setNewNote(defaultNote);
        fetchNotes();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingNote || !user || !canEdit) return;
    
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'Notes', editingNote.id));
      setConfirmDelete(null);
      setEditingNote(null);
      setNewNote(defaultNote);
      setIsModalOpen(false);
      fetchNotes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (note: any) => {
    setEditingNote(note);
    setNewNote({
      date: note.date || '',
      title: note.title || '',
      content: note.content || ''
    });
    setConfirmDelete(null);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingNote(null);
    setNewNote(defaultNote);
    setConfirmDelete(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingNote(null);
    setNewNote(defaultNote);
    setConfirmDelete(null);
    setError('');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    setError('');

    try {
      const { extractTextFromImage } = await import('../utils/gemini');
      const prompt = `
        Extract all text from this image. 
        Return ONLY the extracted text exactly as it appears. 
        Preserve the original formatting, line breaks, and language (especially Thai).
        Do not add any markdown formatting or explanations.
      `;
      
      const extractedText = await extractTextFromImage(file, prompt, selectedModel);
      
      setNewNote(prev => ({
        ...prev,
        content: prev.content ? prev.content + '\n\n' + extractedText : extractedText
      }));
      
    } catch (err: any) {
      setError(err.message || 'Failed to extract text from image');
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Filtering & Sorting Logic
  const filteredNotes = useMemo(() => {
    let result = notes.filter(n => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        (n.title && n.title.toLowerCase().includes(searchLower)) ||
        (n.content && n.content.toLowerCase().includes(searchLower));
      
      // Date range filter
      const matchesStartDate = !filterStartDate || n.date >= filterStartDate;
      const matchesEndDate = !filterEndDate || n.date <= filterEndDate;

      return matchesSearch && matchesStartDate && matchesEndDate;
    });

    // Sorting
    result.sort((a, b) => {
      switch (sortOption) {
        case 'date_desc':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'date_asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'title_asc':
          return (a.title || '').localeCompare(b.title || '');
        case 'title_desc':
          return (b.title || '').localeCompare(a.title || '');
        default:
          return 0;
      }
    });

    return result;
  }, [notes, searchQuery, filterStartDate, filterEndDate, sortOption]);

  if (!activeProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <StickyNote className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">No Profile Selected</h2>
        <p className="text-slate-500 max-w-md mb-6">
          Please select or create a health profile to view and manage notes.
        </p>
        <Link 
          to="/profiles" 
          className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Go to Profiles
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <StickyNote className="w-6 h-6 text-indigo-600" />
            Notes (สมุดบันทึก)
          </h1>
          <p className="text-slate-500 mt-1">
            บันทึกข้อความทั่วไป เช่น เตรียมตัวพบแพทย์ หรืออาการประจำวัน
          </p>
        </div>
        
        {canEdit && (
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm shadow-indigo-200"
          >
            <Plus size={20} />
            เพิ่มบันทึก
          </button>
        )}
      </div>

      {/* Filters and Controls */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาตามหัวข้อ หรือเนื้อหา..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          
          {/* Sort */}
          <div className="w-full md:w-48 relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5">
              <ArrowUpDown className="w-4 h-4 text-slate-400" />
            </div>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all appearance-none"
            >
              <option value="date_desc">วันที่ (ใหม่สุด)</option>
              <option value="date_asc">วันที่ (เก่าสุด)</option>
              <option value="title_asc">หัวข้อ (A-Z)</option>
              <option value="title_desc">หัวข้อ (Z-A)</option>
            </select>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 text-sm text-slate-500 w-full sm:w-auto">
            <Filter className="w-4 h-4" />
            <span className="font-medium">ช่วงเวลา:</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="flex-1 sm:w-auto px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="flex-1 sm:w-auto px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          {(filterStartDate || filterEndDate) && (
            <button
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium ml-auto sm:ml-2"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* Notes List */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <StickyNote className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">ไม่พบบันทึก</h3>
          <p className="text-slate-500">
            {searchQuery || filterStartDate || filterEndDate 
              ? 'ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา'
              : 'ยังไม่มีบันทึกในระบบ เริ่มต้นจดบันทึกได้เลย'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => (
            <div 
              key={note.id} 
              className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-all group flex flex-col h-full cursor-pointer"
              onClick={() => startEdit(note)}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2 text-sm text-slate-500 font-medium bg-slate-50 px-2.5 py-1 rounded-lg">
                  <Calendar className="w-4 h-4" />
                  {formatThaiDate(note.date)}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(note); }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="แก้ไข"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              
              <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-1">
                <Highlight text={note.title || ''} query={searchQuery} />
              </h3>
              
              <div className="text-slate-600 text-sm line-clamp-4 flex-1 whitespace-pre-wrap">
                <Highlight text={note.content || ''} query={searchQuery} />
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <StickyNote className="w-6 h-6 text-indigo-600" />
                {editingNote ? 'แก้ไขบันทึก' : 'เพิ่มบันทึกใหม่'}
              </h2>
              <button 
                onClick={closeModal} 
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {error && (
                <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 border border-red-100">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <form id="note-form" onSubmit={handleSave} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      วันที่ (Date) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={newNote.date}
                      onChange={(e) => setNewNote({ ...newNote, date: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      หัวข้อ (Title) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newNote.title}
                      onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                      placeholder="เช่น คุยกับหมอสมชายเรื่องยา"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                </div>

                {/* AI Image OCR Section */}
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-semibold text-indigo-900 text-sm">ดึงข้อความจากรูปภาพ (AI OCR)</h3>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="text-xs p-1.5 bg-white border border-indigo-200 rounded-lg text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (เร็ว)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (แม่นยำ)</option>
                      </select>
                    </div>
                  </div>
                  
                  <p className="text-xs text-indigo-700/70 mb-3">
                    อัปโหลดรูปภาพเอกสารหรือบันทึก เพื่อให้ AI ช่วยพิมพ์ข้อความลงในช่องด้านล่างอัตโนมัติ
                  </p>
                  
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={analyzing}
                    className="w-full py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        กำลังดึงข้อความ...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        เลือกรูปภาพ
                      </>
                    )}
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    บันทึกข้อความ (Content)
                  </label>
                  <textarea
                    value={newNote.content}
                    onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all h-64 resize-y font-mono text-sm"
                    placeholder="พิมพ์ข้อความที่ต้องการบันทึกที่นี่..."
                  />
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              {editingNote ? (
                <div className="relative">
                  {confirmDelete === editingNote.id ? (
                    <div className="flex items-center gap-2 bg-white p-1 rounded-lg shadow-sm border border-red-100 absolute bottom-0 left-0 w-max">
                      <span className="text-sm text-red-600 font-medium px-2">ยืนยันการลบ?</span>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={saving}
                        className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
                      >
                        ลบ
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        disabled={saving}
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-md hover:bg-slate-200 transition-colors"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(editingNote.id)}
                      className="flex items-center gap-2 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-xl font-medium transition-colors"
                    >
                      <Trash2 size={18} />
                      ลบบันทึก
                    </button>
                  )}
                </div>
              ) : (
                <div></div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  form="note-form"
                  disabled={saving || analyzing}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-indigo-200"
                >
                  {saving ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
