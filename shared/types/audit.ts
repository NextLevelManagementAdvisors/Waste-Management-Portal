export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: any;
  adminName: string;
  adminEmail: string;
  createdAt: string;
}

export interface AuditLogResponse {
  logs: AuditLogEntry[];
  total: number;
}
