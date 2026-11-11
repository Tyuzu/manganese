import { apiFetch } from '../api';

export interface Farm {
  id: string;
  name: string;
  crop: string;
  crops?: string[];
  status: string;
}

export interface FarmInput {
  name: string;
  crop?: string;
  crops?: string[];
  status?: string;
}

export async function listFarms(): Promise<Farm[]> {
  return apiFetch<Farm[]>('/farms', { requiresAuth: true });
}

export async function createFarm(input: FarmInput): Promise<Farm> {
  return apiFetch<Farm>('/farms', {
    method: 'POST',
    requiresAuth: true,
    body: JSON.stringify(input),
  });
}

export async function getFarmDetails(farmID: string): Promise<Farm> {
  return apiFetch<Farm>(`/farms/${farmID}`, { requiresAuth: true });
}

export async function updateFarm(farmID: string, input: FarmInput): Promise<Farm> {
  return apiFetch<Farm>(`/farms/${farmID}`, {
    method: 'PUT',
    requiresAuth: true,
    body: JSON.stringify(input),
  });
}

export async function deleteFarm(farmID: string): Promise<void> {
  await apiFetch<void>(`/farms/${farmID}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function addCropToFarm(farmID: string, cropName: string): Promise<Farm> {
  return apiFetch<Farm>(`/farms/${farmID}/crops`, {
    method: 'POST',
    requiresAuth: true,
    body: JSON.stringify({ name: cropName }),
  });
}

export async function removeCropFromFarm(farmID: string, cropName: string): Promise<Farm> {
  return apiFetch<Farm>(`/farms/${farmID}/crops/${encodeURIComponent(cropName)}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}