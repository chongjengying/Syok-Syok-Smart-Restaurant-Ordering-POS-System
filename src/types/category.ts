export interface CategoryRecord {
  id: string;
  code?: string;
  name: string;
  description?: string | null;
  status?: boolean;
  displayOrder?: number;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  displayOrder?: number;
}

export interface ManagedCategory extends Category { productCount: number; createdAt: string; updatedAt: string; }
export interface CategoryManagementInput { name: string; description?: string; status: boolean; displayOrder: number; }
