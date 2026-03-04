"use client";

import { useState, useEffect } from "react";
import { formatThaiTime } from "@/lib/utils";

export function useClock() {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return {
    time: formatThaiTime(now.toISOString()),
    date: now.toLocaleDateString("th-TH", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    }),
  };
}
