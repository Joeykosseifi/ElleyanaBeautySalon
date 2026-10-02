/**
 * The tenant context every service function receives. Services never read the
 * session themselves — callers (pages / server actions) resolve it once and pass
 * it in, which keeps services testable and makes the tenant boundary explicit.
 */
export interface ServiceContext {
  salonId: string;
  userId: string | null;
  timezone: string;
}
