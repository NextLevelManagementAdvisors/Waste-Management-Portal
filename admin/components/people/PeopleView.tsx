import React, { useState } from 'react';
import { LoadingSpinner } from '../ui/index.ts';
import type { NavFilter } from '../../../shared/types/index.ts';
import PeopleList from './PeopleList.tsx';
import PersonDetail from './PersonDetail.tsx';

const PeopleView: React.FC<{ navFilter?: NavFilter | null; onFilterConsumed?: () => void }> = ({ navFilter, onFilterConsumed }) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [personData, setPersonData] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadPersonDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/people/${id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPersonData(data);
        setSelectedPersonId(id);
      }
    } catch (e) {
      console.error('Failed to load person detail:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  if (detailLoading) return <LoadingSpinner />;

  if (selectedPersonId && personData) {
    return (
      <PersonDetail
        person={personData}
        onBack={() => { setSelectedPersonId(null); setPersonData(null); }}
        onPersonUpdated={(updated) => setPersonData(updated)}
      />
    );
  }

  return (
    <PeopleList
      navFilter={navFilter}
      onFilterConsumed={onFilterConsumed}
      onSelectPerson={loadPersonDetail}
    />
  );
};

export default PeopleView;
