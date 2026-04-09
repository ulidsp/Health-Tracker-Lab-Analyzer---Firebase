import React, { useState, useEffect, useMemo } from 'react';
import { Upload, Pill, CheckCircle2, AlertCircle, Save, X, Plus, Edit2, Search, Calendar, Filter, Clock, Trash2, ArrowUpDown, User, Wand2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import Highlight from '../components/Highlight';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch, query, where } from 'firebase/firestore';
import { getThaiDateString, formatThaiDate } from '../utils/dateUtils';

export default function Medications() {
  const { user } = useAuth();
  const { activeProfile, canEdit } = useProfile();
  const [meds, setMeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [extractedData, setExtractedData] = useState<any[] | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-lite-preview');
  const [uploadStartDate, setUploadStartDate] = useState(getThaiDateString());
  const [uploadEndDate, setUploadEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Manual Entry & Edit State
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingMed, setEditingMed] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  const defaultMed = {
    MedicationName: '',
    Dosage: '',
    Frequency: '',
    Purpose: '',
    StartDate: getThaiDateString(),
    EndDate: '',
    Notes: ''
  };
  const [manualMed, setManualMed] = useState(defaultMed);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [sortOption, setSortOption] = useState('default');

  useEffect(() => {
    if (user && activeProfile) {
      fetchMeds();
    } else {
      setMeds([]);
      setLoading(false);
    }
  }, [user, activeProfile]);

  const fetchMeds = async () => {
    if (!user || !activeProfile) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'Medications'), where('profileId', '==', activeProfile.id));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMeds(data.reverse());
    } catch (error) {
      console.error('Failed to fetch medications', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');
    setExtractedData(null);
    setShowManualForm(false);
    setEditingMed(null);

    try {
      const { analyzeImage } = await import('../utils/gemini');
      const prompt = `
        Analyze this medication label or prescription image. Extract the data into a JSON array of objects.
        IMPORTANT: This image might be a phone screenshot. Please IGNORE all phone UI elements at the top or bottom of the screen. Focus STRICTLY on extracting the medication details from the main content area.
        If there are multiple medications, return an object for each one.
        Each object should have the following keys:
        - MedicationName: The name of the medication (e.g., "Paracetamol", "Amlodipine").
        - Dosage: The strength or dosage per unit (e.g., "500 mg", "10 mg").
        - Frequency: Instructions on how often to take it (e.g., "1 tablet after breakfast and dinner", "1 tab daily").
        - Purpose: The indication or what it is used for. If it is stated on the label, use that. If it is NOT stated on the label, use your medical knowledge to provide the common purpose/indication for this medication in Thai (e.g., "ลดไข้ บรรเทาปวด", "ลดความดันโลหิต").
        - StartDate: The date the medication was prescribed or started (if available, format YYYY-MM-DD). If not available, leave empty.
        - EndDate: The date the medication should be stopped (if available, format YYYY-MM-DD). If not available, leave empty.
        - Notes: Any additional notes, warnings, or side effects mentioned on the label.
        
        Return ONLY the JSON array. Do not include markdown formatting like \`\`\`json.
      `;
      
      let data = await analyzeImage(file, prompt, selectedModel);
      if (!Array.isArray(data)) {
        data = [data];
      }
      
      // Ensure StartDate is populated
      const enrichedData = data.map((item: any) => ({
        ...item,
        StartDate: item.StartDate || item.startDate || uploadStartDate,
        EndDate: item.EndDate || item.endDate || uploadEndDate,
        Notes: item.Notes || item.notes || ''
      }));
      setExtractedData(enrichedData);
      
      // Log usage to backend (Removed for frontend-only)
      
    } catch (err: any) {
      setError(err.message || 'Failed to analyze image');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveExtracted = async () => {
    if (!extractedData) return;
    setSaving(true);
    
    const formattedData = extractedData.map(item => ({
      MedicationName: item.MedicationName || item.medicationName || '',
      Dosage: item.Dosage || item.dosage || '',
      Frequency: item.Frequency || item.frequency || '',
      Purpose: item.Purpose || item.purpose || '',
      StartDate: item.StartDate || '',
      EndDate: item.EndDate || '',
      Notes: item.Notes || ''
    }));

    await saveToServer(formattedData);
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeProfile || !canEdit) return;
    setSaving(true);
    
    if (editingMed) {
      // Update existing
      try {
        await updateDoc(doc(db, 'Medications', editingMed.id), { ...manualMed, profileId: activeProfile.id });
        setEditingMed(null);
        setShowManualForm(false);
        setManualMed(defaultMed);
        fetchMeds();
      } catch (err: any) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
    } else {
      // Create new
      const formattedData = [{ ...manualMed, profileId: activeProfile.id }];
      await saveToServer(formattedData);
    }
  };

  const handleDelete = async () => {
    if (!editingMed || !user || !canEdit) return;
    
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'Medications', editingMed.id));
      setEditingMed(null);
      setShowManualForm(false);
      setManualMed(defaultMed);
      setConfirmDelete(false);
      fetchMeds();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoFillPurposes = async () => {
    if (!user || !activeProfile || !canEdit) return;

    const medsToUpdate = meds.filter(m => !m.Purpose || m.Purpose.trim() === '');
    if (medsToUpdate.length === 0) {
      alert('ไม่มียาที่ต้องเพิ่มสรรพคุณ (ทุกรายการมีสรรพคุณครบแล้ว)');
      return;
    }

    setIsAutoFilling(true);
    setError('');

    try {
      const { generateText } = await import('../utils/gemini');
      
      const medNames = medsToUpdate.map(m => m.MedicationName).join(', ');
      const prompt = `
        I have a list of medications: ${medNames}.
        Please provide the common medical purpose or indication for each of these medications in Thai.
        Return ONLY a valid JSON object where the keys are the exact medication names provided, and the values are their purposes in Thai.
        Example: { "Paracetamol": "ลดไข้ บรรเทาปวด", "Amlodipine": "ลดความดันโลหิต" }
        Do not include markdown formatting like \`\`\`json.
      `;

      const responseText = await generateText(prompt, selectedModel);
      
      const batch = writeBatch(db);
      let updatedCount = 0;

      for (const med of medsToUpdate) {
        const purpose = responseText[med.MedicationName];
        if (purpose) {
          const medRef = doc(db, 'Medications', med.id);
          batch.update(medRef, { Purpose: purpose });
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        await batch.commit();
        fetchMeds();
      }
    } catch (err: any) {
      console.error('Error auto-filling purposes:', err);
      setError('เกิดข้อผิดพลาดในการเพิ่มสรรพคุณยาอัตโนมัติ: ' + err.message);
    } finally {
      setIsAutoFilling(false);
    }
  };

  const saveToServer = async (dataToSave: any[]) => {
    if (!user || !activeProfile) return;
    try {
      const batch = writeBatch(db);
      dataToSave.forEach(data => {
        const newDocRef = doc(collection(db, 'Medications'));
        batch.set(newDocRef, { 
          ...data, 
          profileId: activeProfile.id,
          userId: user.uid
        });
      });
      await batch.commit();
      
      setExtractedData(null);
      setShowManualForm(false);
      setManualMed(defaultMed);
      fetchMeds();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExtractedChange = (index: number, field: string, value: string) => {
    if (!extractedData) return;
    const newData = [...extractedData];
    newData[index] = { ...newData[index], [field]: value };
    setExtractedData(newData);
  };

  const openEditModal = (med: any) => {
    setEditingMed(med);
    setConfirmDelete(false);
    setManualMed({
      MedicationName: med.MedicationName || '',
      Dosage: med.Dosage || '',
      Frequency: med.Frequency || '',
      Purpose: med.Purpose || '',
      StartDate: med.StartDate || '',
      EndDate: med.EndDate || '',
      Notes: med.Notes || ''
    });
    setShowManualForm(true);
    setExtractedData(null);
  };

  // Calculate duration string
  const getDuration = (start: string, end: string) => {
    if (!start) return '-';
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date(getThaiDateString());
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '-';
    
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return '1 วัน';
    if (diffDays < 30) return `${diffDays} วัน`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} เดือน ${diffDays % 30} วัน`;
    return `${Math.floor(diffDays / 365)} ปี ${Math.floor((diffDays % 365) / 30)} เดือน`;
  };

  // Filtering logic
  const filteredMeds = useMemo(() => {
    let result = meds.filter(med => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          (med.MedicationName || '').toLowerCase().includes(query) ||
          (med.Purpose || '').toLowerCase().includes(query) ||
          (med.Notes || '').toLowerCase().includes(query) ||
          (med.GenericName || '').toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Date Range filter
      if (filterStartDate || filterEndDate) {
        const medStart = med.StartDate ? new Date(med.StartDate) : new Date(0);
        const medEnd = med.EndDate ? new Date(med.EndDate) : new Date(9999, 11, 31);
        
        const filterStart = filterStartDate ? new Date(filterStartDate) : new Date(0);
        const filterEnd = filterEndDate ? new Date(filterEndDate) : new Date(9999, 11, 31);
        
        // Check if the medication period overlaps with the filter period
        if (medStart > filterEnd || medEnd < filterStart) {
          return false;
        }
      }

      return true;
    });

    // Sorting logic
    if (sortOption !== 'default') {
      result = [...result].sort((a, b) => {
        if (sortOption === 'name_asc') {
          return (a.MedicationName || '').localeCompare(b.MedicationName || '', 'th');
        } else if (sortOption === 'start_desc') {
          const dateA = a.StartDate ? new Date(a.StartDate).getTime() : 0;
          const dateB = b.StartDate ? new Date(b.StartDate).getTime() : 0;
          return dateB - dateA;
        } else if (sortOption === 'start_asc') {
          const dateA = a.StartDate ? new Date(a.StartDate).getTime() : Infinity;
          const dateB = b.StartDate ? new Date(b.StartDate).getTime() : Infinity;
          return dateA - dateB;
        } else if (sortOption === 'end_desc') {
          const dateA = a.EndDate ? new Date(a.EndDate).getTime() : 0;
          const dateB = b.EndDate ? new Date(b.EndDate).getTime() : 0;
          return dateB - dateA;
        } else if (sortOption === 'end_asc') {
          const dateA = a.EndDate ? new Date(a.EndDate).getTime() : Infinity;
          const dateB = b.EndDate ? new Date(b.EndDate).getTime() : Infinity;
          return dateA - dateB;
        }
        return 0;
      });
    }

    return result;
  }, [meds, searchQuery, filterStartDate, filterEndDate, sortOption]);

  const activeMeds = filteredMeds.filter(med => !med.EndDate || new Date(med.EndDate) >= new Date(getThaiDateString()));
  const pastMeds = filteredMeds.filter(med => med.EndDate && new Date(med.EndDate) < new Date(getThaiDateString()));

  if (!activeProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
          <User size={40} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">No Profile Selected</h2>
        <p className="text-slate-500 max-w-xs">Please select or create a health profile to view and manage medications.</p>
        <Link to="/profiles" className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors">
          Manage Profiles
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Medications: {activeProfile.name}</h1>
          <p className="text-slate-500 mt-2">จัดการรายการยาที่ใช้อยู่ปัจจุบันและประวัติการใช้ยาในอดีตสำหรับ {activeProfile.name}</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-100">
          <label className="text-sm font-medium text-slate-700 whitespace-nowrap">AI Model:</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={uploading || saving}
            className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
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
      </header>

      {/* Action Buttons & Upload Settings */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-4 items-end sm:items-center justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 whitespace-nowrap">วันที่เริ่มใช้ยา (ค่าเริ่มต้น):</label>
              <input 
                type="date" 
                value={uploadStartDate}
                onChange={(e) => setUploadStartDate(e.target.value)}
                disabled={uploading}
                className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 whitespace-nowrap">วันหยุดยา (ค่าเริ่มต้น):</label>
              <input 
                type="date" 
                value={uploadEndDate}
                onChange={(e) => setUploadEndDate(e.target.value)}
                disabled={uploading}
                className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
              />
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="flex-1 relative group cursor-pointer hover:bg-slate-50 transition-colors">
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleFileUpload}
              disabled={uploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
            />
            <div className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">สแกนฉลากยา (AI)</h3>
                <p className="text-sm text-slate-500">อัปโหลดรูปฉลากยาเพื่อดึงข้อมูลอัตโนมัติ</p>
              </div>
            </div>
          </div>

          <button 
            onClick={() => { 
              if (!canEdit) return;
              setEditingMed(null);
              setManualMed(defaultMed);
              setShowManualForm(true); 
              setExtractedData(null); 
              setError(''); 
            }}
            disabled={!canEdit}
            className="flex-1 p-6 flex items-center gap-4 hover:bg-slate-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">เพิ่มข้อมูลยาด้วยตัวเอง</h3>
              <p className="text-sm text-slate-500">กรอกรายละเอียดการใช้ยาด้วยตนเอง</p>
            </div>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Manual Entry / Edit Form Modal */}
      {showManualForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-emerald-100 overflow-hidden ring-1 ring-emerald-50 w-full max-w-2xl my-auto">
            <div className="p-6 border-b border-emerald-50 bg-emerald-50/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {editingMed ? <Edit2 className="w-5 h-5 text-emerald-600" /> : <Plus className="w-5 h-5 text-emerald-600" />}
                <h2 className="text-lg font-semibold text-slate-900">{editingMed ? 'แก้ไขข้อมูลยา' : 'เพิ่มข้อมูลยา'}</h2>
              </div>
              <button 
                onClick={() => { setShowManualForm(false); setEditingMed(null); }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveManual} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อยา *</label>
                <input 
                  type="text" 
                  required
                  value={manualMed.MedicationName}
                  onChange={e => setManualMed({...manualMed, MedicationName: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="เช่น Paracetamol"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ขนาด/ปริมาณ</label>
                <input 
                  type="text" 
                  value={manualMed.Dosage}
                  onChange={e => setManualMed({...manualMed, Dosage: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="เช่น 500 mg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">วิธีใช้/ความถี่</label>
                <input 
                  type="text" 
                  value={manualMed.Frequency}
                  onChange={e => setManualMed({...manualMed, Frequency: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="เช่น 1 เม็ด หลังอาหารเช้า-เย็น"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">สรรพคุณ/ข้อบ่งใช้</label>
                <input 
                  type="text" 
                  value={manualMed.Purpose}
                  onChange={e => setManualMed({...manualMed, Purpose: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="เช่น ลดไข้ บรรเทาปวด"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">วันที่เริ่มใช้ยา</label>
                <input 
                  type="date" 
                  value={manualMed.StartDate}
                  onChange={e => setManualMed({...manualMed, StartDate: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">วันหยุดยา (เว้นว่างถ้ายังใช้อยู่)</label>
                <input 
                  type="date" 
                  value={manualMed.EndDate}
                  onChange={e => setManualMed({...manualMed, EndDate: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ / ผลข้างเคียง</label>
                <textarea 
                  value={manualMed.Notes}
                  onChange={e => setManualMed({...manualMed, Notes: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none min-h-[80px]"
                  placeholder="เช่น กินเพื่อรักษาอาการเจ็บไหล่, กินแล้วมีอาการคลื่นไส้"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-between gap-3">
              {editingMed && canEdit ? (
                <button 
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50",
                    confirmDelete ? "text-white bg-red-600 hover:bg-red-700" : "text-red-600 bg-red-50 hover:bg-red-100"
                  )}
                >
                  <Trash2 className="w-4 h-4" />
                  {confirmDelete ? 'ยืนยันการลบ?' : 'ลบรายการ'}
                </button>
              ) : (
                <div></div>
              )}
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => { 
                    if (confirmDelete) {
                      setConfirmDelete(false);
                    } else {
                      setShowManualForm(false); 
                      setEditingMed(null); 
                      setConfirmDelete(false);
                    }
                  }}
                  className="px-6 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors"
                >
                  ยกเลิก
                </button>
                {canEdit && (
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                  </button>
                )}
              </div>
            </div>
          </form>
          </div>
        </div>
      )}

      {/* Extracted Data Review */}
      {extractedData && (
        <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden ring-1 ring-indigo-50">
          <div className="p-6 border-b border-indigo-50 bg-indigo-50/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-slate-900">ตรวจสอบข้อมูลที่สแกนได้</h2>
            </div>
            <button 
              onClick={() => setExtractedData(null)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 space-y-6">
            {extractedData.map((item, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">ชื่อยา</label>
                  <input 
                    type="text" 
                    value={item.MedicationName || item.medicationName || ''}
                    onChange={(e) => handleExtractedChange(i, 'MedicationName', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">ขนาด/ปริมาณ</label>
                  <input 
                    type="text" 
                    value={item.Dosage || item.dosage || ''}
                    onChange={(e) => handleExtractedChange(i, 'Dosage', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">วิธีใช้</label>
                  <input 
                    type="text" 
                    value={item.Frequency || item.frequency || ''}
                    onChange={(e) => handleExtractedChange(i, 'Frequency', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">สรรพคุณ</label>
                  <input 
                    type="text" 
                    value={item.Purpose || item.purpose || ''}
                    onChange={(e) => handleExtractedChange(i, 'Purpose', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">วันที่เริ่มใช้</label>
                  <input 
                    type="date" 
                    value={item.StartDate || ''}
                    onChange={(e) => handleExtractedChange(i, 'StartDate', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">วันหยุดยา</label>
                  <input 
                    type="date" 
                    value={item.EndDate || ''}
                    onChange={(e) => handleExtractedChange(i, 'EndDate', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">หมายเหตุ</label>
                  <input 
                    type="text" 
                    value={item.Notes || item.notes || ''}
                    onChange={(e) => handleExtractedChange(i, 'Notes', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <button 
                onClick={handleSaveExtracted}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'กำลังบันทึก...' : 'ยืนยันและบันทึกข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:flex-row gap-4 items-start lg:items-center flex-wrap">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">ตัวกรอง:</span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input 
            type="date" 
            value={filterStartDate} 
            onChange={e => setFilterStartDate(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 text-sm w-full sm:w-auto"
          />
          <span className="text-slate-400">-</span>
          <input 
            type="date" 
            value={filterEndDate} 
            onChange={e => setFilterEndDate(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 text-sm w-full sm:w-auto"
          />
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ArrowUpDown className="w-4 h-4 text-slate-400" />
          <select
            value={sortOption}
            onChange={e => setSortOption(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 text-sm w-full sm:w-auto bg-white"
          >
            <option value="default">เรียงตามลำดับที่เพิ่ม</option>
            <option value="name_asc">ชื่อยา (ก-ฮ, A-Z)</option>
            <option value="start_desc">วันเริ่มใช้ยา (ใหม่สุดก่อน)</option>
            <option value="start_asc">วันเริ่มใช้ยา (เก่าสุดก่อน)</option>
            <option value="end_desc">วันหยุดยา (ใหม่สุดก่อน)</option>
            <option value="end_asc">วันหยุดยา (เก่าสุดก่อน)</option>
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="ค้นหาชื่อยา, สรรพคุณ, หมายเหตุ..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 text-sm w-full"
            />
          </div>
          {(filterStartDate || filterEndDate || searchQuery || sortOption !== 'default') && (
            <button 
              onClick={() => { setFilterStartDate(''); setFilterEndDate(''); setSearchQuery(''); setSortOption('default'); }}
              className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap"
            >
              ล้างตัวกรอง
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleAutoFillPurposes}
              disabled={isAutoFilling || meds.filter(m => !m.Purpose || m.Purpose.trim() === '').length === 0}
              className="flex items-center gap-2 px-4 py-1.5 bg-indigo-50 text-indigo-600 font-medium rounded-md hover:bg-indigo-100 transition-colors disabled:opacity-50 whitespace-nowrap text-sm"
              title="ให้ AI ช่วยเติมสรรพคุณยาที่ยังว่างอยู่"
            >
              {isAutoFilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              <span>เพิ่มสรรพคุณยาอัตโนมัติ</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Medications Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Pill className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-slate-900">ยาที่ใช้อยู่ปัจจุบัน (Active)</h2>
          </div>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
            {activeMeds.length} รายการ
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">ชื่อยา</th>
                <th className="px-6 py-4">สรรพคุณ</th>
                <th className="px-6 py-4">วิธีใช้</th>
                <th className="px-6 py-4 min-w-[220px]">ระยะเวลาที่ใช้</th>
                <th className="px-6 py-4 min-w-[250px]">หมายเหตุ</th>
                <th className="px-6 py-4 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">กำลังโหลดข้อมูล...</td>
                </tr>
              ) : activeMeds.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">ไม่พบรายการยาที่ใช้อยู่</td>
                </tr>
              ) : (
                activeMeds.map((m: any, i) => (
                  <tr key={m.id || i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">
                        <Highlight text={m.MedicationName} query={searchQuery} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-600">
                        <Highlight text={m.Purpose} query={searchQuery} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 mb-1">
                        <Highlight text={m.Dosage} query={searchQuery} />
                      </span>
                      <div className="text-slate-700">
                        <Highlight text={m.Frequency} query={searchQuery} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="whitespace-nowrap">เริ่ม: {formatThaiDate(m.StartDate) || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-600 mt-1 font-medium text-xs">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="whitespace-nowrap">ใช้มาแล้ว: {getDuration(m.StartDate, '')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 min-w-[250px] whitespace-pre-wrap">
                      <Highlight text={m.Notes || ''} query={searchQuery} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => openEditModal(m)}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title={canEdit ? "แก้ไขข้อมูล (เช่น ใส่วันหยุดยา)" : "ดูรายละเอียด"}
                      >
                        {canEdit ? <Edit2 className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Past Medications Table */}
      {pastMeds.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-slate-700">ประวัติการใช้ยาในอดีต (Past)</h2>
            </div>
            <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
              {pastMeds.length} รายการ
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">ชื่อยา</th>
                  <th className="px-6 py-4">สรรพคุณ</th>
                  <th className="px-6 py-4">วิธีใช้</th>
                  <th className="px-6 py-4 min-w-[220px]">ช่วงเวลาที่ใช้</th>
                  <th className="px-6 py-4 min-w-[250px]">หมายเหตุ</th>
                  <th className="px-6 py-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pastMeds.map((m: any, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-700">
                        <Highlight text={m.MedicationName} query={searchQuery} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-600">
                        <Highlight text={m.Purpose} query={searchQuery} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-600">
                        <Highlight text={m.Dosage} query={searchQuery} />
                      </div>
                      <div className="text-slate-500 text-xs mt-1">
                        <Highlight text={m.Frequency} query={searchQuery} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-600 text-xs whitespace-nowrap">
                        {formatThaiDate(m.StartDate) || '?'} ถึง {formatThaiDate(m.EndDate)}
                      </div>
                      <div className="text-slate-500 mt-1 font-medium text-xs whitespace-nowrap">
                        รวม: {getDuration(m.StartDate, m.EndDate)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 min-w-[250px] whitespace-pre-wrap">
                      <Highlight text={m.Notes || ''} query={searchQuery} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => openEditModal(m)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
