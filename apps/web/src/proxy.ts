import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LANG, isLang } from '@hw/core/i18n';

/** Sends paths without a language prefix to /th (or the language saved in the cookie). */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split('/')[1];
  if (isLang(first)) return;
  const saved = request.cookies.get('lang')?.value;
  request.nextUrl.pathname = `/${isLang(saved) ? saved : DEFAULT_LANG}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
};
