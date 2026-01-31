import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className }) => {
  const hasBg = className?.includes('bg-');
  const hasBorder = className?.includes('border-');
  
  return (
    <div className={`
      ${!hasBg ? 'bg-white' : ''} 
      ${!hasBorder ? 'border border-base-300' : ''} 
      rounded-2xl shadow-sm p-6 transition-all duration-300 
      ${className || ''}
    `}>
      {children}
    </div>
  );
};