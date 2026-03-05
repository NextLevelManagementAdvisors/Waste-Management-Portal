export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface RoleDefinition {
  id: string;
  label: string;
  permissions: string[];
}

export interface CurrentAdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
}
