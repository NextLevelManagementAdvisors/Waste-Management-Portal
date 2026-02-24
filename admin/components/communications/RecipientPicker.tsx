import React, { useState, useEffect, useRef } from 'react';

interface Recipient {
  id: string;
  type: string;
  name: string;
  email?: string;
  phone?: string;
}

interface RecipientPickerProps {
  selected: Recipient[];
  onChange: (recipients: Recipient[]) => void;
}

const RecipientPicker: React.FC<RecipientPickerProps> = ({ selected, onChange }) => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/admin/customers', { credentials: 'include' })
      .then(r => r.json()).then(data => setCustomers(data.customers || data || [])).catch(() => {});
    fetch('/api/admin/drivers', { credentials: 'include' })
      .then(r => r.json()).then(data => setDrivers(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (r: Recipient) => {
    const exists = selected.find(s => s.id === r.id && s.type === r.type);
    if (exists) onChange(selected.filter(s => !(s.id === r.id && s.type === r.type)));
    else onChange([...selected, r]);
  };

  const selectAllCustomers = () => {
    const customerRecipients: Recipient[] = customers.map((c: any) => ({
      id: c.id, type: 'user',
      name: c.name || `${c.firstName || c.first_name} ${c.lastName || c.last_name}`,
      email: c.email, phone: c.phone,
    }));
    const existingNonCustomers = selected.filter(s => s.type !== 'user');
    onChange([...existingNonCustomers, ...customerRecipients]);
  };

  const selectAllDrivers = () => {
    const driverRecipients: Recipient[] = drivers.map((d: any) => ({
      id: d.id, type: 'driver', name: d.name, email: d.email, phone: d.phone,
    }));
    const existingNonDrivers = selected.filter(s => s.type !== 'driver');
    onChange([...existingNonDrivers, ...driverRecipients]);
  };

  const q = search.toLowerCase();
  const filteredCustomers = q ? customers.filter((c: any) => {
    const name = (c.name || `${c.firstName || c.first_name} ${c.lastName || c.last_name}`).toLowerCase();
    return name.includes(q) || c.email?.toLowerCase().includes(q);
  }) : customers;

  const filteredDrivers = q ? drivers.filter((d: any) =>
    d.name?.toLowerCase().includes(q) || d.email?.toLowerCase().includes(q)
  ) : drivers;

  return (
    <div ref={wrapperRef} className="space-y-2">
      <label className="block text-sm font-bold text-gray-700">Recipients</label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(r => (
            <span key={`${r.type}:${r.id}`} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
              r.type === 'driver' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {r.name}
              <button type="button" onClick={() => toggle(r)} className="text-current hover:opacity-60">&times;</button>
            </span>
          ))}
          {selected.length > 1 && (
            <button type="button" onClick={() => onChange([])} className="text-xs text-gray-400 hover:text-red-500 font-bold px-2">Clear all</button>
          )}
        </div>
      )}

      {/* Quick-select buttons */}
      <div className="flex gap-2">
        <button type="button" onClick={selectAllCustomers}
          className="text-xs font-bold text-teal-600 hover:text-teal-700 px-2 py-1 rounded bg-teal-50 hover:bg-teal-100 transition-colors">
          All Customers ({customers.length})
        </button>
        <button type="button" onClick={selectAllDrivers}
          className="text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded bg-orange-50 hover:bg-orange-100 transition-colors">
          All Drivers ({drivers.length})
        </button>
      </div>

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search by name or email..."
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
        />

        {showDropdown && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
            {filteredCustomers.length > 0 && (
              <>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-3 py-2 bg-gray-50 sticky top-0">Customers</p>
                {filteredCustomers.slice(0, 10).map((c: any) => {
                  const name = c.name || `${c.firstName || c.first_name} ${c.lastName || c.last_name}`;
                  const isSelected = !!selected.find(s => s.id === c.id && s.type === 'user');
                  return (
                    <button key={c.id} type="button"
                      onClick={() => toggle({ id: c.id, type: 'user', name, email: c.email, phone: c.phone })}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${isSelected ? 'bg-teal-50' : ''}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-teal-600 border-teal-600 text-white' : 'border-gray-300'}`}>
                        {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-gray-900">{name}</span>
                        <span className="text-gray-400 ml-2 text-xs">{c.email}</span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
            {filteredDrivers.length > 0 && (
              <>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-3 py-2 bg-gray-50 sticky top-0">Drivers</p>
                {filteredDrivers.slice(0, 10).map((d: any) => {
                  const isSelected = !!selected.find(s => s.id === d.id && s.type === 'driver');
                  return (
                    <button key={d.id} type="button"
                      onClick={() => toggle({ id: d.id, type: 'driver', name: d.name, email: d.email, phone: d.phone })}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${isSelected ? 'bg-teal-50' : ''}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-teal-600 border-teal-600 text-white' : 'border-gray-300'}`}>
                        {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-gray-900">{d.name}</span>
                        <span className="text-gray-400 ml-2 text-xs">{d.email || d.phone || ''}</span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
            {filteredCustomers.length === 0 && filteredDrivers.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No results found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipientPicker;
