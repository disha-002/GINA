import React, { useState } from 'react';
import { useConversation } from '@/lib/hooks/useConversation';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface NewConversationBtnProps {
  onAfterCreate?: () => void;
}

export default function NewConversationBtn({ onAfterCreate }: NewConversationBtnProps) {
  const { createNewConversation } = useConversation();
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const handleCreate = async () => {
    setIsCreating(true);
    const newConv = await createNewConversation();
    if (newConv) {
      router.push(`/app/${newConv.id}`);
      onAfterCreate?.();
    }
    setIsCreating(false);
  };

  return (
    <button
      onClick={handleCreate}
      disabled={isCreating}
      className="w-full flex items-center gap-2 pl-4 py-2 mt-1 text-sm font-medium text-[#7267F2] hover:text-[#A5B4FC] transition-colors group"
    >
      <Plus className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
      <span>New conversation</span>
    </button>
  );
}
