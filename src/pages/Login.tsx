import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export default function Login() {
  const { user, login, loading, error, logout } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  
  // Only redirect if user is logged in AND authorized
  if (user && user.isAuthorized) return <Navigate to="/" />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 text-center">
        <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Health Tracker & Lab Analyzer</h1>
        <p className="text-slate-500 mb-8">Sign in with your Google account to access your personal health data.</p>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium">
            {error}
            <button 
              onClick={logout}
              className="block w-full mt-2 text-xs underline hover:text-red-700"
            >
              Try another account
            </button>
          </div>
        )}

        <button
          onClick={login}
          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 text-slate-700 font-medium py-3 px-4 rounded-xl hover:bg-slate-50 transition-colors focus:ring-4 focus:ring-slate-100"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
          Sign in with Google
        </button>

        <p className="mt-6 text-xs text-slate-400">
          This application is restricted to authorized users only.
        </p>
      </div>
    </div>
  );
}
