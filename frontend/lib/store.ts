"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OrgState {
  organizationId: string | null;
  projectId: string | null;
  organizationName: string | null;
  projectName: string | null;
  setOrganization: (id: string, name: string) => void;
  setProject: (id: string, name: string) => void;
  clear: () => void;
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      organizationId: null,
      projectId: null,
      organizationName: null,
      projectName: null,
      setOrganization: (id, name) =>
        set({ organizationId: id, organizationName: name }),
      setProject: (id, name) => set({ projectId: id, projectName: name }),
      clear: () =>
        set({
          organizationId: null,
          projectId: null,
          organizationName: null,
          projectName: null,
        }),
    }),
    { name: "pm-org-store" }
  )
);
