import { KthPattern } from "./kth-pattern";
import kthLogo from "./kth-logo-blue.svg";

/** Login and "Ingen behörighet": a card with KTH's logo on sand with the line pattern. */
export function SignInFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-kth-sand px-4 py-16">
      <KthPattern className="pointer-events-none absolute inset-0 h-full w-full text-white" />
      <div className="relative flex w-full max-w-md flex-col rounded-xl bg-white p-8 sm:p-10">
        <div className="mb-8 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={kthLogo.src} alt="KTH" width={44} height={49} className="h-[49px] w-11" />
          <span className="flex flex-col border-l border-kth-navy/25 pl-4 leading-tight text-kth-navy">
            <span className="text-[13px] font-semibold text-kth-blue">KTH Biblioteket</span>
            <span className="text-lg font-extrabold">Publika enheter</span>
            <span className="text-[11.5px] font-semibold text-kth-navy/60">PubLiAdmin</span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
