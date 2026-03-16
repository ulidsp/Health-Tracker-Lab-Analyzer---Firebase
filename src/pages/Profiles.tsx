import React, { useState } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { Plus, Edit2, Trash2, Users, Check, X } from 'lucide-react';

export default function Profiles() {
  const { user } = useAuth();
  const { profiles, activeProfile, setActiveProfile } = useProfile();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    gender: 'Male',
    birthDate: '',
    editors: '',
    viewers: ''
  });

  const handleOpenModal = (profile: any = null) => {
    if (profile) {
      setEditingProfile(profile);
      setFormData({
        name: profile.name,
        gender: profile.gender || 'Male',
        birthDate: profile.birthDate || '',
        editors: (profile.editors || []).join(', '),
        viewers: (profile.viewers || []).join(', ')
      });
    } else {
      setEditingProfile(null);
      setFormData({
        name: '',
        gender: 'Male',
        birthDate: '',
        editors: '',
        viewers: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.name.trim()) {
      alert('Please enter a profile name.');
      return;
    }

    const profileData = {
      name: formData.name,
      gender: formData.gender,
      birthDate: formData.birthDate,
      editors: formData.editors.split(',').map(s => s.trim()).filter(s => s),
      viewers: formData.viewers.split(',').map(s => s.trim()).filter(s => s),
      updatedAt: serverTimestamp()
    };

    try {
      if (editingProfile) {
        await updateDoc(doc(db, 'Profiles', editingProfile.id), profileData).catch(err => handleFirestoreError(err, OperationType.UPDATE, `Profiles/${editingProfile.id}`));
      } else {
        await addDoc(collection(db, 'Profiles'), {
          ...profileData,
          ownerId: user.uid,
          createdAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'Profiles'));
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save profile. Please check your permissions or input data.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this profile? All associated data will remain but will be inaccessible.')) {
      try {
        await deleteDoc(doc(db, 'Profiles', id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `Profiles/${id}`));
        if (activeProfile?.id === id) {
          setActiveProfile(null);
        }
      } catch (error) {
        console.error('Error deleting profile:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Profiles</h1>
          <p className="text-gray-500 italic">Create and manage health profiles for family members</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus size={20} />
          Add Profile
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className={`p-6 rounded-2xl border-2 transition-all ${
              activeProfile?.id === profile.id
                ? 'border-emerald-500 bg-emerald-50/50'
                : 'border-gray-100 bg-white hover:border-emerald-200'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xl">
                  {profile.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{profile.name}</h3>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    {profile.ownerId === user?.uid ? 'Owner' : 'Shared with you'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenModal(profile)}
                  className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
                >
                  <Edit2 size={18} />
                </button>
                {profile.ownerId === user?.uid && (
                  <button
                    onClick={() => handleDelete(profile.id)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Editors</span>
                <span className="font-medium">{profile.editors?.length || 0} users</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Viewers</span>
                <span className="font-medium">{profile.viewers?.length || 0} users</span>
              </div>
            </div>

            <button
              onClick={() => setActiveProfile(profile)}
              className={`w-full py-2 rounded-xl font-medium transition-all ${
                activeProfile?.id === profile.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
              }`}
            >
              {activeProfile?.id === profile.id ? 'Active Profile' : 'Switch to Profile'}
            </button>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {editingProfile ? 'Edit Profile' : 'New Profile'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  placeholder="e.g. Mother, John Doe"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Birth Date
                  </label>
                  <input
                    type="date"
                    value={formData.birthDate}
                    onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Editors (User IDs, comma separated)
                </label>
                <textarea
                  value={formData.editors}
                  onChange={(e) => setFormData({ ...formData, editors: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none h-20 text-sm"
                  placeholder="Leave blank if using alone. Paste other users' UIDs to let them edit this profile."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Viewers (User IDs, comma separated)
                </label>
                <textarea
                  value={formData.viewers}
                  onChange={(e) => setFormData({ ...formData, viewers: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none h-20 text-sm"
                  placeholder="Leave blank if using alone. Paste other users' UIDs to let them view this profile."
                />
                <p className="mt-2 text-[10px] text-gray-400 italic">
                  * You can find your own UID in the sidebar under "My Sharing ID".
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                >
                  {editingProfile ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
