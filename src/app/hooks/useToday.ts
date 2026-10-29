import { useEffect, useState } from "react";

/** Local midnight today: day counts and saves name the calendar day, not this moment. */
function localMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Today, at local midnight. Re-checked every minute and whenever the page
 * becomes visible again, so an app left open (or resumed) past midnight moves
 * to the new day. The same Date object is returned while the day is unchanged,
 * so memo and effect dependencies on it don't churn.
 */
export function useToday(): Date {
  const [today, setToday] = useState(localMidnight);
  useEffect(() => {
    const check = () => {
      const now = localMidnight();
      setToday((cur) => (cur.getTime() === now.getTime() ? cur : now));
    };
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return today;
}
