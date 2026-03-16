import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Save, ShieldCheck } from 'lucide-react';
import { calculateAge } from '../utils/age';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>({
    Name: user?.name || '',
    Gender: '',
    BloodGroup: '',
    BirthDate: '',
    MedicalConditions: '',
    Allergies: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    try {
      // Fetch the profile owned by the current user
      const q = query(collection(db, 'Profiles'), where('ownerId', '==', user.uid));
      const querySnapshot = await getDocs(q).catch(err => handleFirestoreError(err, OperationType.LIST, 'Profiles'));
      if (querySnapshot && !querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const data = docSnap.data();
        setProfile({ 
          id: docSnap.id, 
          Name: data.name || '',
          Gender: data.gender || '',
          BloodGroup: data.bloodGroup || '',
          BirthDate: data.birthDate || '',
          MedicalConditions: data.medicalConditions || '',
          Allergies: data.allergies || ''
        });
      }
    } catch (error) {
      console.error('Failed to fetch profile', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const profileData = {
        name: profile.Name,
        gender: profile.Gender,
        bloodGroup: profile.BloodGroup,
        birthDate: profile.BirthDate,
        medicalConditions: profile.MedicalConditions,
        allergies: profile.Allergies,
        editors: profile.editors || [],
        viewers: profile.viewers || [],
        updatedAt: serverTimestamp()
      };

      const docId = profile.id;

      if (docId) {
        await updateDoc(doc(db, 'Profiles', docId), profileData).catch(err => handleFirestoreError(err, OperationType.UPDATE, `Profiles/${docId}`));
      } else {
        const newProfile = {
          ...profileData,
          ownerId: user.uid,
          createdAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, 'Profiles'), newProfile).catch(err => handleFirestoreError(err, OperationType.CREATE, 'Profiles'));
        if (docRef) {
          setProfile({ ...profile, id: docRef.id });
        }
      }
      alert('Profile saved successfully!');
    } catch (error) {
      console.error('Failed to save profile', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Profile</h1>
        <p className="text-slate-500 mt-2">Manage your personal information and medical history.</p>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex items-center gap-6 bg-slate-50/50">
          <img 
            src={user?.picture} 
            alt={user?.name} 
            className="w-24 h-24 rounded-full border-4 border-white shadow-sm"
            referrerPolicy="no-referrer"
          />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{user?.name}</h2>
            <p className="text-slate-500 flex items-center gap-2 mt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Authorized User ({user?.email})
            </p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                <input 
                  type="text" 
                  name="Name"
                  value={profile.Name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Gender</label>
                <select 
                  name="Gender"
                  value={profile.Gender}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male (ชาย)</option>
                  <option value="Female">Female (หญิง)</option>
                  <option value="Other">Other (อื่นๆ)</option>
                  <option value="Prefer not to say">Prefer not to say (ไม่ระบุ)</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">Date of Birth</label>
                  {profile.BirthDate && (
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      อายุ: {calculateAge(profile.BirthDate)}
                    </span>
                  )}
                </div>
                <input 
                  type="date" 
                  name="BirthDate"
                  value={profile.BirthDate}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Blood Group</label>
                <select 
                  name="BloodGroup"
                  value={profile.BloodGroup}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                >
                  <option value="">Select Blood Group</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="AB">AB</option>
                  <option value="O">O</option>
                  <option value="Unknown">Unknown (ไม่ทราบ)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Medical Conditions</label>
              <textarea 
                name="MedicalConditions"
                value={profile.MedicalConditions}
                onChange={handleChange}
                rows={3}
                placeholder="e.g., Hypertension, Type 2 Diabetes"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Allergies</label>
              <textarea 
                name="Allergies"
                value={profile.Allergies}
                onChange={handleChange}
                rows={3}
                placeholder="e.g., Penicillin, Peanuts"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button 
              type="submit" 
              disabled={saving || loading}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
