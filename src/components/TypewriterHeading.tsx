import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

type TextSegment = { text: string; color: string };

/**
 * Types text character by character.
 * Segments are typed in order — useful for multi-color headings.
 */
export default function TypewriterHeading({
  segments,
  speed = 30,
  delay = 400,
  onDone,
  className = "",
}: {
  segments: TextSegment[];
  speed?: number;
  delay?: number;
  onDone?: () => void;
  className?: string;
}) {
  const fullText = segments.map((s) => s.text).join("");
  const [displayedLen, setDisplayedLen] = useState(0);
  const [showCursor, setShowCursor] = useState(true);
  const started = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      let i = 0;
      const interval = setInterval(() => {
        i++;
        if (mounted.current) setDisplayedLen(i);
        if (i >= fullText.length) {
          clearInterval(interval);
          if (mounted.current) setShowCursor(false);
          setTimeout(() => onDone?.(), 200);
        }
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => { clearTimeout(timer); mounted.current = false; };
  }, [fullText, speed, delay, onDone]);

  // Build the displayed text split by segment boundaries
  let remaining = displayedLen;
  const parts: { text: string; color: string }[] = [];
  for (const seg of segments) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, seg.text.length);
    parts.push({ text: seg.text.slice(0, take), color: seg.color });
    remaining -= take;
  }

  return (
    <h1 className={`font-heading leading-[1.02] tracking-[-0.03em] ${className}`}>
      {parts.map((p, i) => (
        <span key={i} style={{ color: p.color }}>
          {p.text.split("\n").map((line, li, arr) => (
            <span key={li}>
              {line}
              {li < arr.length - 1 && <br />}
            </span>
          ))}
        </span>
      ))}
      {showCursor && (
        <span
          className="inline-block w-[3px] align-text-bottom"
          style={{
            height: "1em",
            backgroundColor: "oklch(0.60 0.22 220)",
            marginLeft: 2,
            animation: "blink 0.8s step-end infinite",
          }}
        />
      )}
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </h1>
  );
}
