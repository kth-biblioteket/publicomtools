import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAlmaUser, type AlmaResult } from "@/lib/alma";
import { checkCurrent, create, endBooking, validateOwn, type Reservation } from "@/lib/booking";

/**
 * The login screen of a guest computer, replacing the old local Electron app.
 *
 * 1. When a session starts, the computer (root, device token) asks for a
 *    one-time ticket and opens Chromium on /guest/start?ticket=...
 * 2. Someone logs in on the page. The server checks the account in Alma and
 *    books the computer, exactly like the Electron app did.
 * 3. The computer (root, device token + ticket) polls the session, unlocks
 *    Chromium and starts the guest session with the booking.
 * 4. At logout the computer ends the booking through the server, which holds
 *    the booking system's API key.
 */

export const TICKET_TTL_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

export const ticketRequestSchema = z.object({
  host: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  resourceId: z.string().min(1).max(64),
  computerName: z.string().max(200).optional(),
  defaultHours: z.number().int().min(1).max(12).default(2),
  loginType: z.enum(["password", "pin"]).default("password"),
  bookingType: z.string().max(32).default("dropin"),
});

export const hashTicket = (ticket: string) => createHash("sha256").update(ticket).digest("hex");

export async function createTicket(request: z.infer<typeof ticketRequestSchema>) {
  const ticket = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.$transaction([
    // A computer only ever shows one login screen
    db.guestLogin.updateMany({
      where: { host: request.host, status: { in: ["pending", "working"] } },
      data: { status: "superseded", endedAt: now },
    }),
    db.guestLogin.create({
      data: {
        id: hashTicket(ticket),
        ...request,
        computerName: request.computerName ?? null,
        status: "pending",
        expiresAt: new Date(now.getTime() + TICKET_TTL_MS),
      },
    }),
    db.guestLogin.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
    }),
  ]);
  return ticket;
}

export async function findLogin(ticket: string) {
  if (!ticket) return null;
  return db.guestLogin.findUnique({ where: { id: hashTicket(ticket) } });
}

export type LoginMessage = { en: string; sv: string };
export type LoginOutcome = { ok: true } | { ok: false; title?: LoginMessage; message: LoginMessage };

function almaMessage(reason: Exclude<AlmaResult, { ok: true }>["reason"], loginType: string): LoginOutcome {
  const code = loginType === "pin" ? "PIN" : "Password";
  switch (reason) {
    case "invalid-username":
      return { ok: false, title: { en: "Invalid username.", sv: "Fel användarnamn." }, message: { en: "Please try again.", sv: "Försök igen." } };
    case "invalid":
      return { ok: false, message: { en: `Invalid Username/${code}. Please try again.`, sv: `Fel användarnamn/${code === "PIN" ? "PIN" : "lösenord"}. Försök igen.` } };
    case "not-non-kth":
      return { ok: false, message: { en: "Only external users can login", sv: "Endast externa användare kan logga in" } };
    case "inactive":
      return { ok: false, message: { en: "You need to activate your account, contact the library.", sv: "Du måste aktivera ditt konto, kontakta biblioteket." } };
    default:
      return {
        ok: false,
        title: { en: "An error occurred. Please try again.", sv: "Ett fel uppstod. Försök igen." },
        message: { en: "If the error persists contact the info desk.", sv: "Om felet kvarstår kontakta informationsdisken." },
      };
  }
}

const expiredOutcome: LoginOutcome = {
  ok: false,
  message: { en: "The login screen has expired, please wait while it restarts.", sv: "Inloggningen har gått ut, vänta medan den startar om." },
};

/** Logs in on the login screen identified by the ticket and books the computer. */
export async function login(ticket: string, user: string, code: string): Promise<LoginOutcome> {
  const id = hashTicket(ticket);
  // Claim the login screen, so that a double submit can't create two bookings
  const claimed = await db.guestLogin.updateMany({
    where: { id, status: "pending", expiresAt: { gt: new Date() } },
    data: { status: "working" },
  });
  if (claimed.count === 0) return expiredOutcome;
  const screen = await db.guestLogin.findUniqueOrThrow({ where: { id } });
  const release = () => db.guestLogin.updateMany({ where: { id, status: "working" }, data: { status: "pending" } });

  try {
    const alma = await verifyAlmaUser(user, code, screen.loginType);
    if (!alma.ok) {
      await release();
      return almaMessage(alma.reason, screen.loginType);
    }

    // Drop-in: whoever logs in takes over the computer, so end any booking still running on it
    if (screen.bookingType === "dropin") {
      const current = await checkCurrent(screen.resourceId);
      if (current.valid && current.reservation) {
        await endBooking(current.reservation.id, Math.floor(Date.now() / 1000) - 10, { token: alma.token });
      }
    }

    let result;
    const status = await checkCurrent(screen.resourceId);
    if (!status.valid) {
      const start = Math.floor(Date.now() / 1000);
      const end = start + screen.defaultHours * 60 * 60;
      result = await create(screen.resourceId, user, start, end, alma.token);
    } else {
      result = await validateOwn(alma.primaryId, screen.resourceId);
    }

    if (!result.valid || !result.reservation) {
      await release();
      return {
        ok: false,
        title: { en: "Login/booking failed", sv: "Inloggningen/bokningen misslyckades" },
        message: { en: result.message ?? "", sv: result.message ?? "" },
      };
    }

    const reservation: Reservation = result.reservation;
    await db.guestLogin.update({
      where: { id },
      data: {
        status: "active",
        activatedAt: new Date(),
        bookingId: String(reservation.id),
        userLabel: String(reservation.create_by),
        startTime: Number(reservation.start_time),
        endTime: Number(reservation.end_time),
      },
    });
    return { ok: true };
  } catch (error) {
    console.error("guest login failed:", (error as Error).message);
    await release();
    return almaMessage("error", screen.loginType);
  }
}

/** What the computer needs to start the session, in the format the Electron app printed. */
export function sessionView(screen: NonNullable<Awaited<ReturnType<typeof findLogin>>>) {
  if (screen.status === "active") {
    return {
      status: "active" as const,
      booking_data: {
        id: screen.bookingId,
        create_by: screen.userLabel,
        start_time: screen.startTime,
        end_time: screen.endTime,
      },
    };
  }
  const expired = screen.expiresAt.getTime() < Date.now() && (screen.status === "pending" || screen.status === "working");
  return { status: expired ? ("expired" as const) : (screen.status as "pending" | "working" | "ended" | "superseded") };
}

/** Ends the booking of a finished session. Returns false if there was no such session. */
export async function endSession(host: string, bookingId: string) {
  const screen = await db.guestLogin.findFirst({ where: { host, bookingId, status: "active" } });
  if (!screen) return false;
  const apiKey = process.env.BOOKING_API_KEY;
  if (!apiKey) throw new Error("BOOKING_API_KEY is not set.");
  const result = await endBooking(bookingId, Math.floor(Date.now() / 1000), { apiKey });
  await db.guestLogin.update({ where: { id: screen.id }, data: { status: "ended", endedAt: new Date() } });
  if (!result.valid) console.error(`ending booking ${bookingId} on ${host}:`, result.message ?? "not updated");
  return true;
}
