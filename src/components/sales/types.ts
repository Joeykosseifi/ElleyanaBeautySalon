export interface QuickService {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number | null;
}

export interface QuickCategory {
  id: string;
  name: string;
  services: QuickService[];
}

export interface QuickEmployee {
  id: string;
  name: string;
}

export interface ClientSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  outstandingCents?: number;
}

export interface NewClientDraft {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
}

export type ClientChoice =
  | { kind: "none" }
  | { kind: "walkin" }
  | { kind: "existing"; client: ClientSummary }
  | { kind: "new"; draft: NewClientDraft };
