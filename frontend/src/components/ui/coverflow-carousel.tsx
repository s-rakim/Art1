"use client";

// Coverflow, after educalvolpz's coverflow carousel on 21st.dev: the card in front faces you and
// the rest turn away down both sides, so moving one step reads as the whole row swinging round.
// Rebuilt here on CSS transforms (no extra library) with what the original left out: arrow keys,
// Home and End, swipe, a spoken "3 of 8", no autoplay, and a flat slide for reduced motion.

import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "@/components/icons";
import { cn } from "@/lib/utils";

export type CoverflowProps<T> = {
  items: T[];
  /** Which card starts in front. */
  initial?: number;
  label: string;
  itemKey: (item: T) => string;
  itemLabel: (item: T) => string;
  /** Where the front card goes when clicked or when Enter is pressed. */
  itemHref: (item: T) => string;
  renderItem: (item: T, front: boolean) => ReactNode;
  /** Called after the front card changes because of the visitor. */
  onChange?: (item: T, index: number) => void;
  cardWidth?: number;
  cardHeight?: number;
  className?: string;
};

const VISIBLE = 3; // cards shown on each side of the front one

export function Coverflow<T>({
  items, initial = 0, label, itemKey, itemLabel, itemHref, renderItem, onChange,
  cardWidth = 260, cardHeight = 200, className,
}: CoverflowProps<T>) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(() => Math.min(Math.max(initial, 0), Math.max(items.length - 1, 0)));
  const drag = useRef<{ x: number; id: number } | null>(null);
  const swiped = useRef(false);
  const n = items.length;
  if (n === 0) return null;
  const front = Math.min(active, n - 1);

  function go(i: number) {
    const next = Math.min(Math.max(i, 0), n - 1);
    if (next === front) return;
    setActive(next);
    onChange?.(items[next], next);
  }

  function onKey(e: KeyboardEvent) {
    const to = { ArrowLeft: front - 1, ArrowRight: front + 1, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(to);
  }

  const spread = cardWidth * 0.56;

  return (
    <div className={cn("relative", className)}>
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          drag.current = { x: e.clientX, id: e.pointerId };
          swiped.current = false;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) < 40) return;
          swiped.current = true;
          go(front - Math.sign(dx) * Math.max(1, Math.round(Math.abs(dx) / spread)));
        }}
        onPointerCancel={() => (drag.current = null)}
        className="relative touch-pan-y overflow-hidden rounded-large outline-none select-none [perspective:1200px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-element"
        style={{ height: cardHeight + 32 }}
      >
        {items.map((item, i) => {
          const offset = i - front;
          const far = Math.abs(offset) > VISIBLE;
          const isFront = offset === 0;
          const side = Math.sign(offset);
          // Front: flat and full size. Others: pushed back, turned 45° away, slightly smaller.
          const transform = reduce
            ? `translateX(calc(-50% + ${offset * spread}px)) scale(${isFront ? 1 : 0.9})`
            : `translateX(calc(-50% + ${offset * spread}px)) translateZ(${-Math.abs(offset) * 110}px) rotateY(${-side * 45}deg) scale(${isFront ? 1 : 0.88})`;
          const card = (
            <div className="h-full w-full overflow-hidden rounded-large bg-main-background text-main-text shadow-menu">{renderItem(item, isFront)}</div>
          );
          return (
            <div
              key={itemKey(item)}
              aria-hidden={!isFront}
              className={cn(
                "absolute top-4 left-1/2 transition-[transform,opacity,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-200",
                far && "pointer-events-none opacity-0",
                !isFront && !far && "brightness-[0.97]",
              )}
              style={{ width: cardWidth, height: cardHeight, transform, zIndex: 100 - Math.abs(offset) }}
            >
              {isFront ? (
                <Link
                  href={itemHref(item)}
                  draggable={false}
                  onClick={(e) => swiped.current && e.preventDefault()}
                  className="block h-full w-full rounded-large outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-element"
                >
                  {card}
                </Link>
              ) : (
                // Side cards are for the pointer only; keyboards use the arrows or the buttons.
                <div className="h-full w-full cursor-pointer" onClick={() => !swiped.current && go(i)}>
                  {card}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-center gap-3">
        <button type="button" onClick={() => go(front - 1)} disabled={front === 0} className="btn btn-tertiary btn-icon" aria-label="Previous">
          <ArrowLeft size={20} />
        </button>
        <p className="min-w-[4.5rem] text-center text-[13px] tabular-nums text-maxcontrast" aria-live="polite">
          <span className="sr-only">{itemLabel(items[front])}, </span>
          {front + 1} of {n}
        </p>
        <button type="button" onClick={() => go(front + 1)} disabled={front === n - 1} className="btn btn-tertiary btn-icon" aria-label="Next">
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
