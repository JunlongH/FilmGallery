import axios from 'axios';

// TypeScript interfaces
interface StatsSummary {
  totalRolls: number;
  totalPhotos: number;
  totalFilms: number;
  [key: string]: any;
}

interface StatsInventory {
  items: any[];
  [key: string]: any;
}

interface StatsActivity {
  [key: string]: any;
}

interface StatsCosts {
  [key: string]: any;
}

interface StatsGear {
  cameras: any[];
  lenses: any[];
  [key: string]: any;
}

// NOTE: mobile 端适配现有 server 路由：summary / inventory / activity / costs ...

export async function getStatsOverview(): Promise<StatsSummary> {
  // server: GET /api/stats/summary
  const res = await axios.get('/api/stats/summary');
  return res.data;
}

export async function getStatsInventory(): Promise<StatsInventory> {
  const res = await axios.get('/api/stats/inventory');
  return res.data;
}

export async function getStatsActivity(): Promise<StatsActivity> {
  const res = await axios.get('/api/stats/activity');
  return res.data;
}

export async function getStatsCosts(): Promise<StatsCosts> {
  const res = await axios.get('/api/stats/costs');
  return res.data;
}

export async function getStatsGear(): Promise<StatsGear> {
  const res = await axios.get('/api/stats/gear');
  return res.data;
}
