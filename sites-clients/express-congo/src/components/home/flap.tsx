"use client";
import { useEffect, useRef, useState } from "react";

const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,€→/³.-";

/** Mouvement réduit demandé par l’appareil. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Afficheur à volets, comme un tableau des départs : chaque caractère défile
 * quelques fois avant de se fixer. Texte lu une seule fois par les lecteurs d’écran.
 */
export function Flap({
  value,
  width,
  className = "",
}: {
  value: string;
  width?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const target = (width ? value.padEnd(width, " ") : value).toUpperCase();
  const [shown, setShown] = useState(target);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (reduced) {
      timer.current = null;
      const id = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(id);
    }
    let step = 0;
    timer.current = setInterval(() => {
      step += 1;
      setShown((current) =>
        target
          .split("")
          .map((c, i) => {
            // Chaque case se fixe un peu après sa voisine de gauche.
            if (step > 4 + i * 1.2 || c === (current[i] ?? " ")) return c;
            return CHARS[Math.floor(Math.random() * CHARS.length)];
          })
          .join(""),
      );
      if (step > 6 + target.length * 1.2) {
        clearInterval(timer.current!);
        setShown(target);
      }
    }, 45);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [target, reduced]);

  return (
    <span className={"flap " + className}>
      <span className="sr-only">{value}</span>
      <span className="flap-cells" aria-hidden>
        {shown.split("").map((c, i) => (
          <span
            key={i}
            className={"flap-cell" + (c !== target[i] ? " rolling" : "")}
          >
            {c === " " ? " " : c}
          </span>
        ))}
      </span>
    </span>
  );
}
