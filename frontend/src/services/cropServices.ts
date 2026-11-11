import { apiFetch } from '../api';

export interface CropCatalogueItem {
  name: string;
  type: string;
  description: string;
  waterRequirement: string;
}

export async function getCropCatalogue(): Promise<Record<string, CropCatalogueItem[]>> {
  return apiFetch<Record<string, CropCatalogueItem[]>>('/crops', { requiresAuth: true });
}

export async function getCropCatalogueByType(cropType: string): Promise<CropCatalogueItem[]> {
  return apiFetch<CropCatalogueItem[]>(`/crops/${encodeURIComponent(cropType)}`, { requiresAuth: true });
}
