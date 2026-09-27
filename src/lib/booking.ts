import "server-only";

/**
 * bookingsystem-api (kth-biblioteket/bookingsystem-api), the drop-in
 * bookings of the guest computers. Endpoints as used by the old Electron
 * login app and session_cleanup.sh in publicom:
 *   POST {BOOKING_API_URL}/check/{system}/{resourceId}
 *   POST {BOOKING_API_URL}/validate/{system}/{userId}/{resourceId}
 *   POST {BOOKING_API_URL}/create/{system}/{resourceId}         (x-access-token)
 *   POST {BOOKING_API_URL}/updateendtime/{system}/{id}?end_time= (x-access-token or apikey)
 */

const TIMEOUT_MS = 10_000;

export type Reservation = {
  id: number | string;
  create_by: string;
  start_time: number | string;
  end_time: number | string;
  [key: string]: unknown;
};

export type BookingResult = { valid: boolean; reservation?: Reservation; message?: string };

function endpoint(path: string) {
  const base = process.env.BOOKING_API_URL;
  if (!base) throw new Error("BOOKING_API_URL is not set.");
  const system = process.env.BOOKING_SYSTEM ?? "guestcomputers";
  return `${base}/${path.replace("{system}", system)}`;
}

async function post(url: string, body: object, headers: Record<string, string> = {}): Promise<BookingResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    if (data && typeof data === "object" && "valid" in data) return data as BookingResult;
    return { valid: false, message: typeof data === "string" ? data : `HTTP ${response.status}` };
  } catch (error) {
    console.error("bookingsystem-api:", url.split("?")[0], (error as Error).message);
    return { valid: false, message: "Could not reach the booking system" };
  }
}

const tokenHeader = (token: string | null): Record<string, string> => (token ? { "x-access-token": token } : {});

/** The booking that covers the computer right now, if any. */
export function checkCurrent(resourceId: string) {
  return post(endpoint(`check/{system}/${encodeURIComponent(resourceId)}`), {});
}

/** The user's own booking of the computer right now (not used for drop-in computers). */
export function validateOwn(userId: string, resourceId: string) {
  return post(endpoint(`validate/{system}/${encodeURIComponent(userId)}/${encodeURIComponent(resourceId)}`), {
    alma_user_id: userId,
    resource_id: resourceId,
  });
}

export function create(resourceId: string, user: string, startTime: number, endTime: number, token: string | null) {
  return post(
    endpoint(`create/{system}/${encodeURIComponent(resourceId)}`),
    { create_by: user, name: user, start_time: startTime, end_time: endTime },
    tokenHeader(token)
  );
}

/** Ends a booking now. With the user's token at login, with the API key at logout. */
export function endBooking(bookingId: string | number, endTime: number, auth: { token?: string | null; apiKey?: string }) {
  const url = endpoint(`updateendtime/{system}/${encodeURIComponent(String(bookingId))}?end_time=${endTime}`);
  return post(url, auth.apiKey ? { apikey: auth.apiKey } : {}, tokenHeader(auth.token ?? null));
}
