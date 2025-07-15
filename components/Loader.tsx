
import React from 'react';

const Loader: React.FC = () => {
    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex flex-col items-center justify-center z-50 transition-opacity">
            <div className="w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-white text-lg mt-4">Generating your lesson...</p>
        </div>
    );
};

export default Loader;
