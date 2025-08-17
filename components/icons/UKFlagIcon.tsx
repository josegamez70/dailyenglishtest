import React from 'react';

const UKFlagIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" className={className} fill="none">
        <path fill="#012169" d="M0 0h1200v600H0z"/>
        <path stroke="#fff" strokeWidth="120" d="m0 0 1200 600M0 600 1200 0"/>
        <path stroke="#C8102E" strokeWidth="80" d="m0 0 1200 600M0 600 1200 0"/>
        <path stroke="#fff" strokeWidth="200" d="M600 0v600M0 300h1200"/>
        <path stroke="#C8102E" strokeWidth="120" d="M600 0v600M0 300h1200"/>
    </svg>
);

export default UKFlagIcon;
