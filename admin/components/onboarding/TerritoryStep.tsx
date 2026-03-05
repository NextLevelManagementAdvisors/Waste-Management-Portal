import React from 'react';

interface TerritoryStepProps {
  onComplete: () => void;
}

export const TerritoryStep: React.FC<TerritoryStepProps> = ({ onComplete }) => {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Define Your Service Territory</h1>
      <p className="text-gray-600 mb-6">
        Draw a polygon on the map or enter ZIP codes to define where you operate.
        You can create multiple territories later.
      </p>

      <div className="mb-4">
        <label htmlFor="territoryName" className="block text-sm font-medium text-gray-700 mb-1">
          Territory Name
        </label>
        <input
          type="text"
          id="territoryName"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="e.g., North County"
        />
      </div>

      <div className="h-64 bg-gray-200 rounded-lg mb-6 flex items-center justify-center">
        <p className="text-gray-500">Map placeholder for drawing territory</p>
      </div>

      <button
        onClick={onComplete}
        className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-semibold"
      >
        Save Territory and Continue
      </button>
    </div>
  );
};
