import { notFound } from 'next/navigation';

/** Catch-all so unknown paths render the localized not-found page inside the language layout. */
export default function UnknownPage() {
  notFound();
}
