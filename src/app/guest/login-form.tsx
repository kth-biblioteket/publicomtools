"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { loginAction, type LoginState } from "./actions";

/** Username and password, with the same messages and behaviour as the old Electron login. */
export function LoginForm({ passwordLabel, clearAfterMs }: { passwordLabel: string; clearAfterMs: number }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);
  const [dismissed, setDismissed] = useState<LoginState>(undefined);
  // Controlled, so that the username stays after a failed attempt (React
  // resets uncontrolled fields after every form action); the password is emptied
  const [username, setUsername] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const userRef = useRef<HTMLInputElement>(null);

  // Empty the fields after a while without activity, so the next person
  // doesn't find someone else's username
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setUsername("");
        formRef.current?.reset();
      }, clearAfterMs);
    };
    const events = ["mousemove", "keydown", "wheel", "click"] as const;
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [clearAfterMs]);

  // After a successful login the computer restarts the browser into the
  // guest session within a few seconds; show that instead of the form
  useEffect(() => {
    if (state?.ok) window.location.reload();
  }, [state]);

  const failed = state && !state.ok && state !== dismissed ? state : null;

  const dismiss = () => {
    setDismissed(state);
    const password = formRef.current?.elements.namedItem("password") as HTMLInputElement | null;
    if (password) password.value = "";
    (password ?? userRef.current)?.focus();
  };

  return (
    <>
      <form ref={formRef} action={formAction} className="mt-12 flex flex-col items-center gap-5" autoComplete="off">
        <input
          ref={userRef}
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
          placeholder="användarnamn / username"
          className="w-[400px] rounded-lg bg-white px-3 py-2.5 text-2xl text-gray-900 placeholder:text-gray-500"
        />
        <div className="flex w-[400px]">
          <input
            name="password"
            type="password"
            required
            placeholder={passwordLabel}
            className="min-w-0 flex-1 rounded-l-lg bg-white px-3 py-2.5 text-2xl text-gray-900 placeholder:text-gray-500"
          />
          <button
            type="submit"
            aria-label="Logga in / Log in"
            className="rounded-r-lg bg-gray-200 px-4 text-3xl text-gray-900 hover:bg-gray-300"
          >
            →
          </button>
        </div>
      </form>

      {pending && (
        <div className="fixed inset-0 flex items-center justify-center bg-white/60">
          <div className="h-16 w-16 animate-spin rounded-full border-8 border-kth-blue border-t-transparent" />
        </div>
      )}

      {failed && (
        <div className="fixed inset-0 flex items-center justify-center bg-white/60" onClick={dismiss}>
          <div className="max-w-xl rounded-lg border-l-8 border-yellow-500 bg-white p-6 text-gray-900 shadow-xl">
            {failed.title && (
              <h2 className="text-2xl font-semibold">
                {failed.title.en} / {failed.title.sv}
              </h2>
            )}
            <p className="mt-2 text-xl">{failed.message.en}</p>
            {failed.message.sv !== failed.message.en && <p className="mt-1 text-xl">{failed.message.sv}</p>}
            <button
              type="button"
              autoFocus
              onClick={dismiss}
              className="mt-5 rounded-md bg-green-700 px-6 py-2 text-lg font-medium text-white hover:bg-green-600"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
