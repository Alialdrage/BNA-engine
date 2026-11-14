// الصوت في المتصفح (Web Speech API): إملاء بالصوت ونطق الردود. لا يمر عبر خادمنا.
/* eslint-disable @typescript-eslint/no-explicit-any */

export function recognitionSupported(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function startListening(
  onText: (text: string, final: boolean) => void,
  onEnd: (error?: string) => void,
  lang = 'ar-IQ',
): () => void {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e: any) => {
    let text = '';
    let final = false;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = true;
    }
    onText(text, final);
  };
  rec.onerror = (e: any) =>
    onEnd(e.error === 'not-allowed' ? 'اسمح للمتصفح باستخدام الميكروفون' : e.error === 'no-speech' ? undefined : 'تعذر التعرف على الصوت');
  rec.onend = () => onEnd();
  rec.start();
  return () => rec.stop();
}

// نص مناسب للنطق: بلا روابط وصور وكتل كود وعلامات تنسيق
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' (كود) ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' رابط ')
    .replace(/🔧[^\n]*/g, ' ')
    .replace(/[*_`#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

export function speak(text: string, onEnd: () => void): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  u.lang = 'ar-SA';
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('ar'));
  if (voice) u.voice = voice;
  u.onend = onEnd;
  u.onerror = onEnd;
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
