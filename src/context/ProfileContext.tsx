import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, or } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthContext';

import { UserRole } from '../config';

interface Profile {
  id: string;
  name: string;
  ownerId: string;
  editors: string[];
  viewers: string[];
  gender?: string;
  birthDate?: string;
}

interface ProfileContextType {
  activeProfile: Profile | null;
  profiles: Profile[];
  setActiveProfile: (profile: Profile | null) => void;
  loading: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  isReader: boolean;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !user.isAuthorized) {
      setProfiles([]);
      setActiveProfile(null);
      setLoading(false);
      return;
    }

    // Query profiles
    // ADMIN sees everything
    // Others see only what they own or are shared with
    const q = user.role === UserRole.ADMIN
      ? query(collection(db, 'Profiles'))
      : query(
          collection(db, 'Profiles'),
          or(
            where('ownerId', '==', user.uid),
            where('editors', 'array-contains', user.uid),
            where('viewers', 'array-contains', user.uid)
          )
        );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const profileList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profile));
      
      setProfiles(profileList);
      
      // Try to restore active profile from localStorage
      const savedProfileId = localStorage.getItem('activeProfileId');
      if (savedProfileId) {
        const saved = profileList.find(p => p.id === savedProfileId);
        if (saved) {
          setActiveProfile(saved);
        } else if (profileList.length > 0) {
          setActiveProfile(profileList[0]);
        }
      } else if (profileList.length > 0 && !activeProfile) {
        setActiveProfile(profileList[0]);
      }
      
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'Profiles');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (activeProfile) {
      localStorage.setItem('activeProfileId', activeProfile.id);
    }
  }, [activeProfile]);

  const isAdmin = user?.role === UserRole.ADMIN;
  const isReader = user?.role === UserRole.READER;

  const canEdit = activeProfile 
    ? (isAdmin || (!isReader && (activeProfile.ownerId === user?.uid || (activeProfile.editors && activeProfile.editors.includes(user?.uid || '')))))
    : false;

  return (
    <ProfileContext.Provider value={{ activeProfile, profiles, setActiveProfile, loading, canEdit, isAdmin, isReader }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
