export interface CategoryRecord {
  id: string;
  name: string;
  description?: string | null;
  status?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}
