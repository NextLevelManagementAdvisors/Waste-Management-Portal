
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className }) => {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-base-300 p-6 ${className || ''}`}>
      {children}
    </div>
  );
};
