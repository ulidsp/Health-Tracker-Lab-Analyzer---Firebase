import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';

import { ALLOWED_EMAILS, ENABLE_WHITELIST } from '../config';

interface User {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  isAuthorized: boolean;
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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      setError(null);
      if (firebaseUser) {
        const isAuthorized = !ENABLE_WHITELIST || (firebaseUser.email ? ALLOWED_EMAILS.includes(firebaseUser.email) : false);
        
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          picture: firebaseUser.photoURL,
          isAuthorized: isAuthorized
        });

        if (!isAuthorized) {
          setError('Access Denied: Your email is not on the authorized list.');
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
      
      if (ENABLE_WHITELIST && firebaseUser.email && !ALLOWED_EMAILS.includes(firebaseUser.email)) {
        setError('Access Denied: Your email is not on the authorized list.');
        // We don't sign out immediately so the user can see the error, 
        // but the app logic will block them because isAuthorized will be false.
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
