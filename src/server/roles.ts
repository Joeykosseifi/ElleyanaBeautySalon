export type Role = "OWNER" | "MANAGER" | "STAFF";

/** Roles allowed to manage services, employees, expenses and view reports. */
export const MANAGE_ROLES: Role[] = ["OWNER", "MANAGER"];

export const canManage = (role: Role) => MANAGE_ROLES.includes(role);
