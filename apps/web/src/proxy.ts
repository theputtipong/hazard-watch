import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LANG, isLang } from '@hw/core/i18n';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split('/')[1];
  if (isLang(first)) {
    // Lets the not-found page know the language (it receives no route params).
    const headers = new Headers(request.headers);
    headers.set('x-pathname', pathname);
    return NextResponse.next({ request: { headers } });
  }
  const saved = request.cookies.get('lang')?.value;
  request.nextUrl.pathname = `/${isLang(saved) ? saved : DEFAULT_LANG}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
};
