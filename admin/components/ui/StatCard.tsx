import React from 'react';
import { Card } from '../../../components/Card.tsx';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  accent = 'text-teal-700',
  onClick
}) => (
  <Card className={`p-5 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-teal-200 transition-all group' : ''}`} onClick={onClick}>
    <div className="flex items-center justify-between">
      <div>
        <p className={`text-xs font-black uppercase tracking-widest text-gray-400 ${onClick ? 'group-hover:text-teal-600' : ''}`}>{label}</p>
        <p className={`text-2xl font-black mt-1 ${accent}`}>{value}</p>
      </div>
      <div className={`text-gray-300 ${onClick ? 'group-hover:text-teal-400 transition-colors' : ''}`}>{icon}</div>
    </div>
  </Card>
);
