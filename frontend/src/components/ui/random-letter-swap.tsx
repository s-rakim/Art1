"use client";

// Random letter swap, from 21st.dev (cnippet-dev). Changes for this app: the effect also runs
// when the surrounding link or button is hovered or reached with the keyboard, it stays still
// for people who ask for reduced motion, and screen readers get the label once, as plain text.

import { type AnimationOptions, motion, useAnimate, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type RandomLetterSwapProps = {
  label: string;
  reverse?: boolean;
  transition?: AnimationOptions;
  staggerDuration?: number;
  className?: string;
  onClick?: () => void;
};

export function RandomLetterSwap({
  label,
  reverse = true,
  transition = { duration: 0.8, type: "spring" },
  staggerDuration = 0.02,
  className,
  onClick,
  ...props
}: RandomLetterSwapProps) {
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const reduce = useReducedMotion();
  const blocked = useRef(false);
  const shuffledRef = useRef<number[] | null>(null);

  const hoverStart = useCallback(() => {
    if (blocked.current || reduce || !scope.current) return;
    blocked.current = true;
    // Shuffled on first use rather than during render, so server and client markup match.
    const shuffled = (shuffledRef.current ??= Array.from({ length: label.length }, (_, i) => i).sort(() => Math.random() - 0.5));
    let left = label.length;
    const done = () => {
      left -= 1;
      if (left <= 0) blocked.current = false;
    };

    for (let i = 0; i < label.length; i++) {
      const idx = shuffled[i];
      const merged: AnimationOptions = { ...transition, delay: i * staggerDuration };
      animate(`.letter-${idx}`, { y: reverse ? "100%" : "-100%" }, merged).then(() => animate(`.letter-${idx}`, { y: 0 }, { duration: 0 }));
      animate(`.letter-secondary-${idx}`, { top: "0%" }, merged)
        .then(() => animate(`.letter-secondary-${idx}`, { top: reverse ? "-100%" : "100%" }, { duration: 0 }))
        .then(done, done);
    }
  }, [label, animate, transition, staggerDuration, reverse, reduce, scope]);

  // Run the swap when the whole link (or button) around the text is hovered or focused, not
  // only the letters themselves.
  useEffect(() => {
    const host = scope.current?.closest<HTMLElement>("a, button");
    if (!host) return;
    const onFocus = () => host.matches(":focus-visible") && hoverStart();
    host.addEventListener("pointerenter", hoverStart);
    host.addEventListener("focus", onFocus);
    return () => {
      host.removeEventListener("pointerenter", hoverStart);
      host.removeEventListener("focus", onFocus);
    };
  }, [hoverStart, scope]);

  return (
    <motion.span ref={scope} className={cn("relative inline-flex items-center overflow-hidden", className)} onClick={onClick} {...props}>
      <span className="sr-only">{label}</span>
      {label.split("").map((letter, i) => (
        <span aria-hidden="true" className="relative flex whitespace-pre" key={i}>
          <motion.span className={`relative py-[0.08em] letter-${i}`} style={{ top: 0 }}>
            {letter}
          </motion.span>
          <motion.span className={`absolute py-[0.08em] letter-secondary-${i}`} style={{ top: reverse ? "-100%" : "100%" }}>
            {letter}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

export default RandomLetterSwap;
