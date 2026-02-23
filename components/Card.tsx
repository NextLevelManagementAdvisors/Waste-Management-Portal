
import React from 'react';

// Added onClick to CardProps to support interactivity and resolve prop-not-found errors in parent components
interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
  const hasBg = className.includes('bg-');
  const hasBorder = className.includes('border-');
  const hasShadow = className.includes('shadow-');
  
  return (
    <div 
      className={`
        ${!hasBg ? 'bg-white' : ''} 
        ${!hasBorder ? 'border border-base-200' : ''} 
        ${!hasShadow ? 'shadow-[0_8px_30px_rgb(0,0,0,0.04)]' : ''}
        rounded-[1.5rem] p-4 sm:p-6 lg:p-8 transition-all duration-300
        ${className}
      `}
      // Pass the optional onClick prop to the container div
      onClick={onClick}
    >
      {children}
    </div>
  );
};
