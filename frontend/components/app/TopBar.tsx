'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface TopBarProps {
  onMenuClick: () => void;
  showSidebarToggle?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebarCollapse?: () => void;
}

export default function TopBar({
  onMenuClick,
  showSidebarToggle = false,
  sidebarCollapsed = false,
  onToggleSidebarCollapse,
}: TopBarProps) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  const handleOutsideClick = (e: MouseEvent) => {
    const t = e.target as Node;
    if (userRef.current && !userRef.current.contains(t)) setUserMenuOpen(false);
  };

  React.useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    await signOut();
    router.push('/');
  };

  const initials = (user?.email?.substring(0, 2) ?? 'U').toUpperCase();

  return (
    <header
      className="w-full border-b border-white/5 py-4 px-8 flex items-center justify-between z-20 sticky top-0 bg-surface/80 backdrop-blur-md"
    >
      <div className="flex items-center gap-4 md:gap-8">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white md:hidden"
          aria-label="Open conversations"
        >
          <Menu className="h-5 w-5" />
        </button>

        {showSidebarToggle && onToggleSidebarCollapse && (
          <button
            type="button"
            onClick={onToggleSidebarCollapse}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white md:-ml-6 md:flex"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        )}

        <Link href="/app" className="group shrink-0 flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-white">G.I.N.A</span>
        </Link>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((o) => !o)}
            className="btn-press flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #5A4EE3, #3CE0D6)',
              boxShadow: userMenuOpen
                ? '0 0 0 3px rgba(90,78,227,0.35), 0 0 0 1px rgba(60,224,214,0.2)'
                : '0 0 0 2px rgba(90,78,227,0.20)',
            }}
            aria-label="Account menu"
          >
            {initials}
          </button>
          {userMenuOpen && (
            <div
              className="absolute right-0 top-full z-[60] mt-2 w-60 overflow-hidden rounded-xl border border-white/8 shadow-2xl"
              style={{
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                background: 'rgba(18, 22, 32, 0.97)',
              }}
            >
              <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #5A4EE3, #3CE0D6)' }}
                  >
                    {initials}
                  </div>
                  <p className="min-w-0 truncate text-sm text-slate-200">{user?.email ?? 'Signed in'}</p>
                </div>
              </div>
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition-colors duration-150 hover:bg-white/5 hover:text-white"
                >
                  <LogOut className="h-4 w-4 text-slate-500" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
