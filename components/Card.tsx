
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  const hasBg = className.includes('bg-');
  const hasBorder = className.includes('border-');
  const hasShadow = className.includes('shadow-');
  
  return (
    <div className={`
      ${!hasBg ? 'bg-white' : ''} 
      ${!hasBorder ? 'border border-base-200' : ''} 
      ${!hasShadow ? 'shadow-[0_8px_30px_rgb(0,0,0,0.04)]' : ''}
      rounded-[1.5rem] p-8 transition-all duration-300 
      ${className}
    `}>
      {children}
    </div>
  );
};
