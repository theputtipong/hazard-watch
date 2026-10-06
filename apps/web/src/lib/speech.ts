'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Lang } from '@hw/core/i18n';
import { WEB } from '@/config';

const BCP47: Record<Lang, string> = { th: 'th-TH', en: 'en-US' };
const noSubscribe = () => () => {};

/** Voices load asynchronously, so `hasVoice` updates once the list arrives. */
export function useSpeech(lang: Lang) {
  // false on the server: avoids a hydration mismatch and setState in an effect.
  const supported = useSyncExternalStore(noSubscribe, () => 'speechSynthesis' in window, () => false);
  const [hasVoice, setHasVoice] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const check = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) setHasVoice(voices.some((v) => v.lang.toLowerCase().startsWith(lang)));
    };
    check();
    window.speechSynthesis.addEventListener('voiceschanged', check);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', check);
      window.speechSynthesis.cancel();
    };
  }, [lang]);

  const speak = useCallback(
    (text: string) => {
      if (!('speechSynthesis' in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = BCP47[lang];
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
      if (voice) u.voice = voice;
      u.rate = WEB.speech.rate;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(u);
    },
    [lang],
  );

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { supported, hasVoice, speaking, speak, stop };
}
