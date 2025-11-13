
import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, label, disabled = false }) => {
  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <label className="flex items-center cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={handleToggle}
          disabled={disabled}
        />
        <div className={`block w-14 h-8 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-gray-300'}`}></div>
        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${checked ? 'transform translate-x-6' : ''}`}></div>
      </div>
      {label && <span className="ml-3 text-sm font-medium text-gray-700">{label}</span>}
    </label>
  );
};

export default ToggleSwitch;
