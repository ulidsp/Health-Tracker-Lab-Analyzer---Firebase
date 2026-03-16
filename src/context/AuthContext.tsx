import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';

import { AUTHORIZED_USERS, ENABLE_WHITELIST, UserRole } from '../config';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

interface User {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  isAuthorized: boolean;
  role: UserRole | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      setError(null);
      if (firebaseUser) {
        const userRole = firebaseUser.email ? AUTHORIZED_USERS[firebaseUser.email] : null;
        const isAuthorized = !ENABLE_WHITELIST || !!userRole;
        
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          picture: firebaseUser.photoURL,
          isAuthorized: isAuthorized,
          role: userRole || null
        });

        if (!isAuthorized) {
          setError('Access Denied: Your email is not on the authorized list.');
        } else if (userRole) {
          // Sync role to Firestore if authorized
          try {
            const { db } = await import('../firebase');
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (!userDoc.exists() || userDoc.data()?.role !== userRole) {
              await setDoc(userDocRef, {
                email: firebaseUser.email,
                role: userRole,
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          } catch (error) {
            // This might fail if the user is not an admin, which is expected for non-admins
            // unless we allow users to write their own role if it matches the whitelist.
            console.error('Role sync failed (likely permission denied):', error);
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      
      if (ENABLE_WHITELIST && firebaseUser.email && !AUTHORIZED_USERS[firebaseUser.email]) {
        setError('Access Denied: Your email is not on the authorized list.');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      setError('Failed to sign in with Google.');
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
