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
  bloodType?: string;
  medicalConditions?: string;
  allergies?: string;
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

    if (user.role === UserRole.ADMIN) {
      const q = query(collection(db, 'Profiles'));
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
    } else {
      const qOwner = query(collection(db, 'Profiles'), where('ownerId', '==', user.uid));
      const qEditor = query(collection(db, 'Profiles'), where('editors', 'array-contains', user.uid));
      const qViewer = query(collection(db, 'Profiles'), where('viewers', 'array-contains', user.uid));

      let ownerProfiles: Profile[] = [];
      let editorProfiles: Profile[] = [];
      let viewerProfiles: Profile[] = [];

      const updateProfiles = () => {
        const allProfiles = [...ownerProfiles, ...editorProfiles, ...viewerProfiles];
        const uniqueProfiles = Array.from(new Map(allProfiles.map(p => [p.id, p])).values());
        
        setProfiles(uniqueProfiles);
        
        // Try to restore active profile from localStorage
        const savedProfileId = localStorage.getItem('activeProfileId');
        if (savedProfileId) {
          const saved = uniqueProfiles.find(p => p.id === savedProfileId);
          if (saved) {
            setActiveProfile(saved);
          } else if (uniqueProfiles.length > 0) {
            setActiveProfile(uniqueProfiles[0]);
          }
        } else if (uniqueProfiles.length > 0 && !activeProfile) {
          setActiveProfile(uniqueProfiles[0]);
        }
        
        setLoading(false);
      };

      const unsubOwner = onSnapshot(qOwner, (snapshot) => {
        ownerProfiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profile));
        updateProfiles();
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'Profiles');
      });

      const unsubEditor = onSnapshot(qEditor, (snapshot) => {
        editorProfiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profile));
        updateProfiles();
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'Profiles');
      });

      const unsubViewer = onSnapshot(qViewer, (snapshot) => {
        viewerProfiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profile));
        updateProfiles();
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'Profiles');
      });

      return () => {
        unsubOwner();
        unsubEditor();
        unsubViewer();
      };
    }
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
