import React from 'react';
import type { ConfigOptions } from '../types';
import { LEVELS, TOPICS, WILDCARD_TOPIC, WORD_COUNTS, QUESTION_COUNTS } from '../constants';

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
    <label className="block text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">{label}</label>
    <select
      value={value}
      onChange={onChange}
      className="w-full bg-white dark:bg-slate-800 border-2 border-slate-500 dark:border-slate-300 rounded-md py-2.5 px-3 text-base text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-blue-700 focus:outline-none"
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
          onChange={(e) => handleConfigChange('wordCount', parseInt(e.target.value, 10))}
          options={WORD_COUNTS}
        />
        <SelectInput
          label="Number of Questions"
          value={config.questionCount}
          onChange={(e) => handleConfigChange('questionCount', parseInt(e.target.value, 10))}
          options={QUESTION_COUNTS}
        />
      </div>
      {config.topic === WILDCARD_TOPIC && (
        <p className="text-base text-slate-900 dark:text-slate-50">
          We will choose a topic for you at random.
        </p>
      )}
      <button
        type="button"
        onClick={onGenerate}
        disabled={isLoading}
        className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg"
      >
        {isLoading ? 'Generating...' : 'Start Learning'}
      </button>
    </div>
  );
};

export default Configurator;
