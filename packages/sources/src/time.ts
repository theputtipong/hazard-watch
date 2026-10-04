import { REQUEST } from './endpoints';

const BKK_OFFSET = REQUEST.thaiOffset;

/** "2026-10-03" + "21:00" (Bangkok local) -> ISO string. */
export function bkkLocal(date: string, time: string): string {
  return new Date(`${date}T${time.length === 5 ? `${time}:00` : time}${BKK_OFFSET}`).toISOString();
}

/** ASP.NET JSON date "/Date(1791039300000)/" -> ISO string. */
export function aspNetDate(value: string | null | undefined): string | null {
  const ms = value?.match(/\d+/)?.[0];
  return ms ? new Date(Number(ms)).toISOString() : null;
}
