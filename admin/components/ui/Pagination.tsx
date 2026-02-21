import React from 'react';
import { Button } from '../../../components/Button.tsx';

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (newOffset: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  total,
  limit,
  offset,
  onChange,
}) => {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="flex items-center justify-between py-4 px-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="text-sm text-gray-600">
        Showing <span className="font-bold">{offset + 1}</span> to <span className="font-bold">{Math.min(offset + limit, total)}</span> of <span className="font-bold">{total}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          ← Previous
        </Button>

        <div className="px-3 py-1 bg-white border border-gray-200 rounded text-sm font-semibold text-gray-700">
          {currentPage} / {totalPages}
        </div>

        <Button
          variant="secondary"
          size="sm"
          disabled={!canNext}
          onClick={() => onChange(offset + limit)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
};
