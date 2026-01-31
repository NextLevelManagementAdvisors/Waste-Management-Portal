import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  // Check if specific utility patterns are present to avoid adding defaults
  const hasBg = className.includes('bg-');
  const hasBorder = className.includes('border-');
  const hasShadow = className.includes('shadow-');
  
  return (
    <div className={`
      ${!hasBg ? 'bg-white' : ''} 
      ${!hasBorder ? 'border border-base-300' : ''} 
      ${!hasShadow ? 'shadow-sm' : ''}
      rounded-2xl p-6 transition-all duration-300 
      ${className}
    `}>
      {children}
    </div>
  );
};