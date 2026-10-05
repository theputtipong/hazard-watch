import { notFound } from 'next/navigation';

/** Any unknown path under /th or /en renders the localized not-found page (inside the language layout). */
export default function UnknownPage() {
  notFound();
}
