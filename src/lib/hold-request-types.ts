import { Timestamp } from 'firebase/firestore';

export interface HoldRequest {
  id: string;
  inventoryItemId: string;
  moduleId: string;
  inventorySnapshot: {
    name: string;
    stockNumber: string;
    model: string;
    colour: string;
    material: string;
    status: string;
  };
  requestingOrganisationId: string;
  requestingOrganisationName: string;
  requestedByUserId: string;
  requestedByUserName: string;
  parentOrganisationId: string;
  customerId: string;
  customerName: string;
  status: 'pending' | 'accepted' | 'rejected';
  resolvedByUserId?: string;
  resolvedByUserName?: string;
  resolvedAt?: Timestamp;
  rejectionReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Customer {
  id: string;
  organisationId: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  notes?: string;
  createdByUserId: string;
  createdByUserName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
