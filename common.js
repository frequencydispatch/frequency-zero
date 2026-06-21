// FREQUENCY ZERO — shared utilities
// Mirrors the callsign system used in the terminal (index.html) so identity
// persists across every page of the archive.
(function(window){
  "use strict";

  const CALLSIGN_KEY = 'fz_callsign';
  const LISTEN_FLAG_KEY = 'fz_listening_complete';

  function generateCallsign(){
    const words = ['ECHO','DRIFT','RELAY','STATIC','HOLLOW','ANALOG','CIPHER','VESSEL','SIGNAL','EMBER'];
    const w = words[Math.floor(Math.random()*words.length)];
    const n = Math.floor(1000 + Math.random()*8999);
    return (w+'-'+n).toLowerCase();
  }

  function getCallsign(){
    let c = localStorage.getItem(CALLSIGN_KEY);
    if(!c){
      c = generateCallsign();
      localStorage.setItem(CALLSIGN_KEY, c);
    }
    return c;
  }

  function setListeningComplete(){
    localStorage.setItem(LISTEN_FLAG_KEY, String(Date.now()));
  }

  function getListeningStatus(){
    const v = localStorage.getItem(LISTEN_FLAG_KEY);
    if(!v) return null;
    return new Date(parseInt(v,10));
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function nowStamp(){
    return new Date().toISOString().replace('T',' ').replace('Z',' UTC');
  }

  function triggerGlitch(el, duration){
    if(!el) return;
    el.classList.add('active');
    setTimeout(()=>el.classList.remove('active'), duration || 200);
  }

  window.FZ = {
    getCallsign, setListeningComplete, getListeningStatus,
    escapeHtml, nowStamp, triggerGlitch
  };
})(window);
