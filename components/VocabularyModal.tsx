import React from 'react';
import type { VocabularyItem } from '../types';
import XIcon from './icons/XIcon';

interface VocabularyModalProps {
    isOpen: boolean;
    onClose: () => void;
    vocabulary: VocabularyItem[];
}

const VocabularyModal: React.FC<VocabularyModalProps> = ({ isOpen, onClose, vocabulary }) => {
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
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-800 hover:text-blue-800 dark:text-slate-100 dark:hover:text-blue-200 transition-colors p-1 rounded-full"
                    aria-label="Close vocabulary"
                >
                    <XIcon className="w-6 h-6" />
                </button>
                <h3 className="text-2xl font-bold mb-6 text-center text-slate-900 dark:text-slate-50">Key Vocabulary</h3>
                <dl className="space-y-4 max-h-[60vh] overflow-y-auto pr-4">
                    {vocabulary.map((item, index) => (
                        <div key={index} className="bg-slate-50 dark:bg-slate-700 p-3 rounded-lg">
                            <dt className="font-semibold text-lg text-blue-800 dark:text-blue-200 capitalize">{item.word}</dt>
                            <dd className="mt-1 text-base text-slate-900 dark:text-slate-50">{item.definition}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </div>
    );
};

export default VocabularyModal;
