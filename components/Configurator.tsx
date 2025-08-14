import React from 'react';
import type { ConfigOptions } from '../types';
import { LEVELS, TOPICS, WORD_COUNTS, QUESTION_COUNTS } from '../constants';

interface ConfiguratorProps {
  config: ConfigOptions;
  setConfig: React.Dispatch<React.SetStateAction<ConfigOptions>>;
  onGenerate: () => void;
  isLoading: boolean;
}

const SelectInput: React.FC<{
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string | number; label: string }[];
}> = ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">{label}</label>
    <select
      value={value}
      onChange={onChange}
      className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </div>
);

const Configurator: React.FC<ConfiguratorProps> = ({ config, setConfig, onGenerate, isLoading }) => {
  const handleConfigChange = <K extends keyof ConfigOptions>(field: K, value: ConfigOptions[K]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectInput 
          label="Difficulty Level"
          value={config.level}
          onChange={(e) => handleConfigChange('level', e.target.value)}
          options={LEVELS}
        />
        <SelectInput 
          label="Story Topic"
          value={config.topic}
          onChange={(e) => handleConfigChange('topic', e.target.value)}
          options={TOPICS}
        />
        <SelectInput 
          label="Story Length"
          value={config.wordCount}
          onChange={(e) => handleConfigChange('wordCount', parseInt(e.target.value))}
          options={WORD_COUNTS}
        />
        <SelectInput 
          label="Number of Questions"
          value={config.questionCount}
          onChange={(e) => handleConfigChange('questionCount', parseInt(e.target.value))}
          options={QUESTION_COUNTS}
        />
      </div>
      <button
        onClick={onGenerate}
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg"
      >
        {isLoading ? 'Generating...' : 'Start Learning'}
      </button>
    </div>
  );
};

export default Configurator;
