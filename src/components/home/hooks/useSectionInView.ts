import { useRef } from "react";
import { useInView } from "framer-motion";

/**
 * Fires once when a section scrolls into view (80px before it fully enters).
 * Relocated from Home.tsx's inline useAnimateInView so every section shares it.
 */
export function useSectionInView() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return { ref, isInView };
}
