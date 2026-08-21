export interface CategoryRecord {
  id: string;
  code?: string;
  name: string;
  description?: string | null;
  status?: boolean;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
}
