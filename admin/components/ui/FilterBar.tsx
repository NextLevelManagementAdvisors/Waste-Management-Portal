import React from 'react';

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({ children, className = '' }) => (
  <div className={`flex flex-col sm:flex-row gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 ${className}`}>
    {children}
  </div>
);
