import React from 'react';
import type { VocabularyItem } from '../types';
import { KeyVocabularyList } from './KeyVocabularyList';
import XIcon from './icons/XIcon';

interface VocabularyModalProps {
    isOpen: boolean;
    onClose: () => void;
    vocabulary: VocabularyItem[];
    savedKeys: Set<string>;
    signedIn: boolean;
    missing: boolean;
    pendingKey?: string | null;
    notice?: string | null;
    onToggle: (item: VocabularyItem) => void;
}

const VocabularyModal: React.FC<VocabularyModalProps> = ({
    isOpen,
    onClose,
    vocabulary,
    savedKeys,
    signedIn,
    missing,
    pendingKey,
    notice,
    onToggle,
}) => {
    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 transition-opacity"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div
                className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-lg w-full max-w-lg mx-4 relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-800 hover:text-blue-800 dark:text-slate-100 dark:hover:text-blue-200 transition-colors p-1 rounded-full"
                    aria-label="Close vocabulary"
                >
                    <XIcon className="w-6 h-6" />
                </button>
                <div className="max-h-[70vh] overflow-y-auto pr-2">
                  <KeyVocabularyList
                    items={vocabulary}
                    savedKeys={savedKeys}
                    signedIn={signedIn}
                    missing={missing}
                    pendingKey={pendingKey}
                    notice={notice}
                    onToggle={onToggle}
                  />
                </div>
            </div>
        </div>
    );
};

export default VocabularyModal;
