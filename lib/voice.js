let rec = null;

export const voice = {
  async start({ onPartial, onFinal, onError }) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) throw new Error('SpeechRecognition not supported');
    rec = new SpeechRecognition();
    rec.lang = 'en-GB';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0]?.transcript || '';
        if (r.isFinal) final += txt;
        else interim += txt;
      }
      if (interim && onPartial) onPartial(interim.trim());
      if (final && onFinal) onFinal(final.trim());
    };

    rec.onerror = () => { if (onError) onError(); };

    rec.start();
  },
  stop() {
    try { rec && rec.stop(); } catch {}
    rec = null;
  }
};
