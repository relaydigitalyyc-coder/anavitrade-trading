import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { EASE_OUT } from "../hooks/motion";

type RevealProps = {
  children: ReactNode;
  /** Delay before the reveal starts, in seconds. */
  delay?: number;
  /** Vertical travel distance, in px. */
  y?: number;
  /** Duration in seconds. */
  duration?: number;
  className?: string;
  as?: "div" | "section" | "span" | "li";
};

/**
 * The single scroll-reveal wrapper for the homepage. Fades + rises once when
 * scrolled into view. Reduced-motion users get an instant, static appearance.
 * Replaces the repeated inline initial/animate/variants boilerplate.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 40,
  duration = 0.6,
  className,
  as = "div",
}: RevealProps) {
  const prefersReduced = useReducedMotion();
  const MotionTag = motion[as];

  if (prefersReduced) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration, delay, ease: EASE_OUT }}
    >
      {children}
    </MotionTag>
  );
}
