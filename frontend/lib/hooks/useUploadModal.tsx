'use client';

import React, { createContext, useContext, useState } from 'react';
import UploadModal from '@/components/upload/UploadModal';

interface UploadModalContextType {
  openUploadModal: () => void;
  closeUploadModal: () => void;
}

const UploadModalContext = createContext<UploadModalContextType | undefined>(undefined);

export function UploadModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openUploadModal = () => setIsOpen(true);
  const closeUploadModal = () => setIsOpen(false);

  return (
    <UploadModalContext.Provider value={{ openUploadModal, closeUploadModal }}>
      {children}
      {isOpen && <UploadModal onClose={closeUploadModal} />}
    </UploadModalContext.Provider>
  );
}

export function useUploadModal() {
  const context = useContext(UploadModalContext);
  if (context === undefined) {
    throw new Error('useUploadModal must be used within an UploadModalProvider');
  }
  return context;
}
