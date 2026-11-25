"use client";
import { useEffect, useState } from "react";

/** "Good morning" and friends, by the visitor's own clock, as on Nextcloud's dashboard. */
export function Greeting({ fallback }: { fallback: string }) {
  const [text, setText] = useState(fallback);
  useEffect(() => {
    const h = new Date().getHours();
    setText(h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);
  return <>{text}</>;
}
