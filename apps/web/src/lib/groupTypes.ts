import api from "@/lib/api";

export interface GroupTypeDef {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
}

export const DEFAULT_GROUP_TYPE_COLOR = "#94a3b8";

export async function fetchGroupTypes(includeInactive = false): Promise<GroupTypeDef[]> {
  const { data } = await api.get<GroupTypeDef[]>("/groups/types", {
    params: includeInactive ? { include_inactive: true } : undefined,
  });
  return data ?? [];
}
