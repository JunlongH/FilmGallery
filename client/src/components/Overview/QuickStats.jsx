/**
 * QuickStats - Dashboard statistics cards
 * 
 * Shows key metrics:
 * - Total rolls
 * - Total photos
 * - Favorite photos
 * - Locations visited
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Skeleton } from '@heroui/react';
import { motion } from 'framer-motion';
import { Camera, Image, Heart, MapPin, Film } from 'lucide-react';
import { getApiBase } from '../../api';

const statItems = [
  { key: 'rolls', icon: Camera, label: 'Rolls', color: 'text-primary', path: '/rolls' },
  { key: 'photos', icon: Image, label: 'Photos', color: 'text-success', path: '/rolls' }, // Go to Library
  { key: 'favorites', icon: Heart, label: 'Favorites', color: 'text-danger', path: '/favorites' },
  { key: 'locations', icon: MapPin, label: 'Locations', color: 'text-warning', path: '/map' },
  { key: 'films', icon: Film, label: 'Film Types', color: 'text-secondary', path: '/films' },
];

async function fetchStats() {
  const apiBase = getApiBase();
  const [rollsRes, photosRes, favsRes, locsRes, filmsRes] = await Promise.all([
    fetch(`${apiBase}/api/rolls`).then(r => r.json()),
    fetch(`${apiBase}/api/photos`).then(r => r.json()),
    fetch(`${apiBase}/api/photos?favorite=true`).then(r => r.json()),
    fetch(`${apiBase}/api/locations?hasRecords=true`).then(r => r.json()),
    fetch(`${apiBase}/api/films`).then(r => r.json()),
  ]);
  
  return {
    rolls: Array.isArray(rollsRes) ? rollsRes.length : 0,
    photos: Array.isArray(photosRes) ? photosRes.length : 0,
    favorites: Array.isArray(favsRes) ? favsRes.length : 0,
    locations: Array.isArray(locsRes) ? locsRes.length : 0,
    films: Array.isArray(filmsRes) ? filmsRes.length : 0,
  };
}

export default function QuickStats() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['quickStats'],
    queryFn: fetchStats,
    staleTime: 60000, // Cache for 1 minute
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
      {statItems.map((item, index) => (
        <motion.div
          key={item.key}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, duration: 0.3 }}
          className="h-full"
        >
          <Card 
            className="bg-content1/60 backdrop-blur-md shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group h-full border-none ring-0"
            isPressable
            onPress={() => item.path && navigate(item.path)}
          >
            <CardBody className="p-4 flex flex-row items-center gap-5">
              <div className={`p-4 rounded-2xl shadow-lg bg-gradient-to-br from-content2 to-content3 ${item.color} group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                <item.icon size={28} />
              </div>
              <div className="flex-1">
                {isLoading ? (
                  <>
                    <Skeleton className="w-16 h-8 rounded-lg mb-2" />
                    <Skeleton className="w-12 h-4 rounded-lg" />
                  </>
                ) : (
                  <div className="flex flex-col items-start">
                    <span className="text-3xl font-black text-foreground tracking-tight">
                      {stats?.[item.key]?.toLocaleString() || 0}
                    </span>
                    <span className="text-xs text-default-400 font-medium uppercase tracking-wider">{item.label}</span>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
