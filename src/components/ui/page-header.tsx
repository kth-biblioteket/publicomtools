import Link from "next/link";
import { ChevronLeftIcon } from "./icons";
import { KthPattern } from "./kth-pattern";

/** Side padding of the page column; the page header bleeds out to its edges. */
export const PAGE_PAD = "px-4 sm:px-8 lg:px-12";
const BLEED = "-mx-4 sm:-mx-8 lg:-mx-12";
const INNER = `${PAGE_PAD} max-w-[1276px]`;

/**
 * The sand page header with KTH's line pattern, across the page column: back link, heading, lead, actions,
 * and tabs along its lower edge. `heading` replaces the plain <h1> (e.g. one that can be renamed).
 */
export function PageHeader({
  title,
  heading,
  back,
  lead,
  actions,
  children,
  tabs,
}: {
  title?: React.ReactNode;
  heading?: React.ReactNode;
  back?: { href: string; label: string };
  lead?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  tabs?: React.ReactNode;
}) {
  return (
    <div className={`relative ${BLEED} mb-2 overflow-hidden bg-kth-sand`}>
      <KthPattern className="pointer-events-none absolute inset-y-0 right-0 h-full w-[62%] text-white" />
      <div className={`relative ${INNER} flex flex-col gap-2 pt-7 ${tabs ? "pb-4" : "pb-8"}`}>
        {back && (
          <Link href={back.href} className="inline-flex w-fit items-center gap-1 text-[13.5px] font-bold text-kth-blue">
            <ChevronLeftIcon />
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            {heading ?? <h1 className="text-[34px] font-extrabold leading-tight tracking-tight sm:text-[40px]">{title}</h1>}
            {lead && <div className="max-w-[720px] text-[15px] text-[#3d4450]">{lead}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
        </div>
        {children}
      </div>
      {tabs && <div className={`relative ${INNER}`}>{tabs}</div>}
    </div>
  );
}
