import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner } from '../ui/index.ts';
import type { NavFilter } from '../../../shared/types/index.ts';
import PeopleList from './PeopleList.tsx';
import PersonDetail from './PersonDetail.tsx';

interface PeopleViewProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  selectedPersonId?: string | null;
  onSelectPerson?: (id: string) => void;
  onBack?: () => void;
}

const PeopleView: React.FC<PeopleViewProps> = ({ navFilter, onFilterConsumed, selectedPersonId, onSelectPerson, onBack }) => {
  const [personData, setPersonData] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadPersonDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/people/${id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPersonData(data);
      }
    } catch (e) {
      console.error('Failed to load person detail:', e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Load person data when selectedPersonId changes (e.g. from deep link or URL navigation)
  useEffect(() => {
    if (selectedPersonId && (!personData || personData.id !== selectedPersonId)) {
      loadPersonDetail(selectedPersonId);
    }
    if (!selectedPersonId) {
      setPersonData(null);
    }
  }, [selectedPersonId, loadPersonDetail]);

  const handleSelectPerson = (id: string) => {
    onSelectPerson?.(id);
    loadPersonDetail(id);
  };

  const handleBack = () => {
    setPersonData(null);
    onBack?.();
  };

  if (detailLoading) return <LoadingSpinner />;

  if (selectedPersonId && personData) {
    return (
      <PersonDetail
        person={personData}
        onBack={handleBack}
        onPersonUpdated={(updated) => setPersonData(updated)}
        onPersonDeleted={handleBack}
      />
    );
  }

  return (
    <PeopleList
      navFilter={navFilter}
      onFilterConsumed={onFilterConsumed}
      onSelectPerson={handleSelectPerson}
    />
  );
};

export default PeopleView;
