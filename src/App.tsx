import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vitals from './pages/Vitals';
import LabResults from './pages/LabResults';
import Medications from './pages/Medications';
import HealthEvents from './pages/HealthEvents';
import Notes from './pages/Notes';
import FamilyHistory from './pages/FamilyHistory';
import Activities from './pages/Activities';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Profiles from './pages/Profiles';
import Layout from './components/Layout';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user || !user.isAuthorized) return <Navigate to="/login" />;
  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="vitals" element={<Vitals />} />
              <Route path="lab-results" element={<LabResults />} />
              <Route path="medications" element={<Medications />} />
              <Route path="activities" element={<Activities />} />
              <Route path="family-history" element={<FamilyHistory />} />
              <Route path="events" element={<HealthEvents />} />
              <Route path="notes" element={<Notes />} />
              <Route path="chat" element={<Chat />} />
              <Route path="profile" element={<Profile />} />
              <Route path="profiles" element={<Profiles />} />
            </Route>
          </Routes>
        </Router>
      </ProfileProvider>
    </AuthProvider>
  );
}
