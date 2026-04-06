import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { Activity, FileText, Pill, MessageSquare, User, LayoutDashboard, LogOut, CalendarHeart, ArrowUpToLine, ArrowUp, ArrowDown, ActivitySquare, Users, UserPlus, ChevronDown, Copy, Check, Home, StickyNote, HeartPulse } from 'lucide-react';
import clsx from 'clsx';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function Layout() {
  const { user, logout } = useAuth();
  const { activeProfile, profiles, setActiveProfile } = useProfile();
  const location = useLocation();
  const [profileName, setProfileName] = useState<string>('');
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyUserId = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.pathname, user]);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/vitals', label: 'Vitals', icon: Activity },
    { path: '/lab-results', label: 'Lab Results', icon: FileText },
    { path: '/medications', label: 'Medications', icon: Pill },
    { path: '/activities', label: 'Activities', icon: ActivitySquare },
    { path: '/family-history', label: 'Family History', icon: Users },
    { path: '/events', label: 'Health Events', icon: CalendarHeart },
    { path: '/diagnostics', label: 'Diagnostics', icon: HeartPulse },
    { path: '/notes', label: 'Notes', icon: StickyNote },
    { path: '/chat', label: 'AI Assistant', icon: MessageSquare },
    { path: '/profiles', label: 'Manage Profiles', icon: Users },
  ];

  const scrollToTop = () => {
    const topHeader = document.getElementById('top-header');
    if (topHeader) {
      topHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToMainContent = () => {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    const chatBottom = document.getElementById('chat-bottom');
    if (chatBottom) {
      chatBottom.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <header id="top-header" className="bg-white border-b border-slate-200">
        <div className="px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="items-center">
            <h1 className="text-lg md:text-xl font-bold text-slate-800">Health Tracker</h1>
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-emerald-600">
                {activeProfile ? `Viewing: ${activeProfile.name}` : 'No Profile Selected'}
              </div>
              <Link to="/profiles" className="text-[10px] uppercase tracking-wider text-slate-400 hover:text-indigo-600 font-bold">
                Change
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <a 
              href="https://health-hub-links.vercel.app" 
              className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all font-bold text-sm"
              title="Back to Health Hub Home"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Home</span>
            </a>

            <div className="hidden sm:flex items-center gap-3 mr-2">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900 truncate max-w-[120px] md:max-w-[200px]">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate max-w-[120px] md:max-w-[200px]">{user?.email}</p>
              </div>
              <img src={user?.picture} alt={user?.name} className="w-8 h-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
            </div>
            
            {/* Mobile user image only */}
            <div className="sm:hidden">
              <img src={user?.picture} alt={user?.name} className="w-8 h-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
            </div>

            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <button 
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-sm">
                    {activeProfile?.name.charAt(0) || '?'}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-900 truncate max-w-[100px]">
                      {activeProfile?.name || 'Select Profile'}
                    </p>
                    <p className="text-[10px] text-slate-500">Active Profile</p>
                  </div>
                </div>
                <ChevronDown size={16} className={clsx("transition-transform", isProfileDropdownOpen && "rotate-180")} />
              </button>

              {isProfileDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="max-height-[200px] overflow-y-auto">
                    {profiles.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActiveProfile(p);
                          setIsProfileDropdownOpen(false);
                        }}
                        className={clsx(
                          "w-full text-left px-4 py-3 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between",
                          activeProfile?.id === p.id && "bg-emerald-50 text-emerald-700 font-medium"
                        )}
                      >
                        {p.name}
                        {activeProfile?.id === p.id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                  <Link 
                    to="/profiles" 
                    onClick={() => setIsProfileDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-indigo-600 hover:bg-indigo-50 border-t border-slate-100 transition-colors font-medium"
                  >
                    <UserPlus size={14} />
                    Manage Profiles
                  </Link>
                </div>
              )}
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
                    isActive 
                      ? 'bg-indigo-50 text-indigo-600 font-medium' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">My Sharing ID</p>
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200">
              <code className="text-[10px] text-slate-600 truncate mr-2">{user?.uid}</code>
              <button onClick={copyUserId} className="text-slate-400 hover:text-indigo-600 transition-colors">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-[9px] text-slate-400 mt-2 italic">Share this ID with others to give them access.</p>
          </div>
        </aside>

        {/* Main Content */}
        <main id="main-content" className="flex-1">
          <div className="p-6 md:p-8 max-w-5xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating Shortcut Buttons */}
      <div className={clsx(
        "fixed right-6 md:right-8 flex flex-col gap-3 z-50 transition-all duration-300 bottom-32 md:bottom-36"
      )}>
        <button
          onClick={scrollToTop}
          className="p-3 bg-white text-slate-700 rounded-full shadow-lg hover:bg-slate-50 border border-slate-200 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          title="Scroll to very top (Header)"
        >
          <ArrowUpToLine className="w-5 h-5" />
        </button>
        <button
          onClick={scrollToMainContent}
          className="p-3 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          title="Scroll to content top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
        {location.pathname === '/chat' && (
          <button
            onClick={scrollToBottom}
            className="p-3 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            title="Scroll to latest message"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
