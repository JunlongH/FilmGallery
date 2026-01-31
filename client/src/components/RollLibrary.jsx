// src/components/RollLibrary.jsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRolls } from '../api';
import { useNavigate } from 'react-router-dom';
import RollGrid from './RollGrid';
import { getCacheStrategy } from '../lib';

export default function RollLibrary() {
  const nav = useNavigate();

  const { data: rolls = [], isLoading } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => getRolls(),
    ...getCacheStrategy('rolls'),
    keepPreviousData: true,
  });

  if (isLoading) return <div className="p-10 text-center text-default-500">Loading rolls...</div>;

  return (
    <div className="flex flex-col min-h-full bg-background text-foreground p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-2xl font-bold">Roll Library</h3>
        <div>
          <button 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium" 
            onClick={() => nav('/rolls/new')}
          >
            New Roll
          </button>
        </div>
      </div>
      <RollGrid rolls={rolls} />
    </div>
  );
}