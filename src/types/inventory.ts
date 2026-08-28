export interface InventoryItem{id:string;branch_id:string;product_id:string;product_code:string;product_name:string;stock_on_hand:number;reorder_level:number;unit:string;version:number;updated_at:string}
export interface InventoryPage{rows:InventoryItem[];total:number}
export interface BranchOption{id:string;name:string}
