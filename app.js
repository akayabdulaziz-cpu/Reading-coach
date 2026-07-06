const SAMPLE_TEXT = "Learning a new language is like tending a garden. Some days the words grow quickly, and other days nothing seems to change at all. Patience, curiosity, and daily practice are what turn a small vocabulary into fluent, confident speech. Try reading this paragraph aloud, then tap any word you don't recognize to see its definition, pronunciation, and example sentences.";

const CARD_COLORS = ["#E8DCC8", "#D9E4DC", "#E3D9E8", "#F0DED0"];

let state = {
  text: SAMPLE_TEXT,
  isSpeaking: false,
  isPaused: false,
  rate: 0.95,
  activeCharIndex: -1,
  voices: [],
  voiceURI: "",
  lookup: null, // { word, loading, error, data }
};

let utterance = null;

const el = (id) => document.getElementById(id);

function tokenize(text) {
  const re = /[A-Za-z']+|[^A-Za-z']+/g;
  const tokens = [];
  let match;
  let cursor = 0;
  while ((match = re.exec(text)) !== null) {
    tokens.push({ text: match[0], isWord: /[A-Za-z]/.test(match[0]), start: cursor });
    cursor += match[0].length;
  }
  return tokens;
}

function renderReadingText() {
  const container = el("readingText");
  container.innerHTML = "";
  const tokens = tokenize(state.text);
  let activeStart = -1;
  if (state.activeCharIndex >= 0) {
    for (const t of tokens) {
      if (t.isWord && t.start <= state.activeCharIndex && state.activeCharIndex < t.start + t.text.length) {
        activeStart = t.start;
        break;
      }
    }
  }
  tokens.forEach((t) => {
    const span = document.createElement("span");
    span.textContent = t.text;
    if (t.isWord) {
      span.className = "rc-word" + (t.start === activeStart ? " active" : "");
      span.addEventListener("click", () => lookupWord(t.text));
    } else {
      span.style.whiteSpace = "pre-wrap";
    }
    container.appendChild(span);
  });
}

function loadVoices() {
  const all = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const en = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
  state.voices = en.length ? en : all;
  if (!state.voiceURI && state.voices[0]) state.voiceURI = state.voices[0].voiceURI;
  renderVoiceSelect();
}

function renderVoiceSelect() {
  const select = el("voiceSelect");
  if (!state.voices.length) {
    select.style.display = "none";
    return;
  }
  select.style.display = "inline-block";
  select.innerHTML = "";
  state.voices.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    if (v.voiceURI === state.voiceURI) opt.selected = true;
    select.appendChild(opt);
  });
}

function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  state.isSpeaking = false;
  state.isPaused = false;
  state.activeCharIndex = -1;
  renderReadingText();
  renderPlayButton();
}

function startSpeaking() {
  if (!("speechSynthesis" in window)) {
    alert("Sorry, your browser does not support text-to-speech.");
    return;
  }
  window.speechSynthesis.cancel();
  utterance = new SpeechSynthesisUtterance(state.text);
  utterance.rate = state.rate;
  const chosen = state.voices.find((v) => v.voiceURI === state.voiceURI);
  if (chosen) utterance.voice = chosen;
  utterance.onboundary = (e) => {
    state.activeCharIndex = e.charIndex;
    renderReadingText();
  };
  utterance.onend = () => {
    state.isSpeaking = false;
    state.isPaused = false;
    state.activeCharIndex = -1;
    renderReadingText();
    renderPlayButton();
  };
  utterance.onerror = () => {
    state.isSpeaking = false;
    state.isPaused = false;
    renderPlayButton();
  };
  window.speechSynthesis.speak(utterance);
  state.isSpeaking = true;
  state.isPaused = false;
  renderPlayButton();
}

function togglePause() {
  if (!state.isSpeaking) return;
  if (state.isPaused) {
    window.speechSynthesis.resume();
    state.isPaused = false;
  } else {
    window.speechSynthesis.pause();
    state.isPaused = true;
  }
  renderPlayButton();
}

function renderPlayButton() {
  const btn = el("playBtn");
  const stopBtn = el("stopBtn");
  stopBtn.disabled = !state.isSpeaking;
  if (state.isSpeaking && !state.isPaused) {
    btn.innerHTML = "&#10074;&#10074; Pause";
  } else if (state.isPaused) {
    btn.innerHTML = "&#9654; Resume";
  } else {
    btn.innerHTML = "&#9654; Read aloud";
  }
}

async function lookupWord(rawWord) {
  const word = rawWord.toLowerCase().replace(/[^a-z']/g, "");
  if (!word) return;
  state.lookup = { word, loading: true, error: null, data: null };
  renderPanel();
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error("not found");
    const data = await res.json();
    state.lookup = { word, loading: false, error: null, data: data[0] };
  } catch (err) {
    state.lookup = { word, loading: false, error: "No definition found for this word.", data: null };
  }
  renderPanel();
}

function playPronunciation(url) {
  if (!url) return;
  const src = url.startsWith("//") ? "https:" + url : url;
  const audio = new Audio(src);
  audio.play().catch(() => {});
}

function renderPanel() {
  const panel = el("panel");
  panel.innerHTML = "";

  if (!state.lookup) {
    panel.innerHTML = `
      <div class="empty-panel">
        <div class="empty-punch-row"><span class="punch"></span><span class="punch"></span></div>
        <p class="empty-title">Word cards appear here</p>
        <p class="empty-text">Tap a word in the text to see its definition, pronunciation, and examples.</p>
      </div>`;
    return;
  }

  const { word, loading, error, data } = state.lookup;
  const color = CARD_COLORS[word.length % CARD_COLORS.length];

  const card = document.createElement("div");
  card.className = "card";
  card.style.backgroundColor = color;

  let html = `
    <div class="punch-row">
      <span class="punch"></span><span class="punch"></span>
      <button class="close-btn" id="closeCardBtn" aria-label="Close">&times;</button>
    </div>
    <h2 class="card-word">${escapeHtml(word)}</h2>
  `;

  if (loading) {
    html += `<div class="loading-row"><span class="spin">&#8635;</span> Looking it up&hellip;</div>`;
  }

  if (error) {
    html += `<p class="error-text">${error} Try the full entry on Cambridge Dictionary below.</p>`;
  }

  if (data) {
    const phoneticEntry = (data.phonetics || []).find((p) => p.text);
    if (phoneticEntry) {
      html += `<p class="phonetic">${escapeHtml(phoneticEntry.text)}</p>`;
    }

    const audios = (data.phonetics || []).filter((p) => p.audio).slice(0, 2);
    if (audios.length) {
      html += `<div class="audio-row">`;
      audios.forEach((p, i) => {
        html += `<button class="audio-btn" data-audio-index="${i}">&#128266; Listen</button>`;
      });
      html += `</div>`;
    }

    html += `<div class="meanings-wrap">`;
    (data.meanings || []).slice(0, 4).forEach((m) => {
      html += `<div class="meaning-block">
        <span class="pos">${escapeHtml(m.partOfSpeech || "")}</span>
        <ol class="def-list">`;
      (m.definitions || []).slice(0, 2).forEach((d) => {
        html += `<li class="def-item">${escapeHtml(d.definition)}`;
        if (d.example) html += `<div class="example">&ldquo;${escapeHtml(d.example)}&rdquo;</div>`;
        html += `</li>`;
      });
      html += `</ol>`;
      if (m.synonyms && m.synonyms.length) {
        html += `<p class="synonyms"><strong>Synonyms:</strong> ${escapeHtml(m.synonyms.slice(0, 5).join(", "))}</p>`;
      }
      html += `</div>`;
    });
    html += `</div>`;

    card._audios = audios;
  }

  html += `<a class="cambridge-link" href="https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}" target="_blank" rel="noopener noreferrer">Open full entry on Cambridge Dictionary &#8599;</a>`;

  card.innerHTML = html;
  panel.appendChild(card);

  const closeBtn = document.getElementById("closeCardBtn");
  if (closeBtn) closeBtn.addEventListener("click", () => { state.lookup = null; renderPanel(); });

  if (card._audios) {
    card._audios.forEach((p, i) => {
      const btn = card.querySelector(`[data-audio-index="${i}"]`);
      if (btn) btn.addEventListener("click", () => playPronunciation(p.audio));
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function setupToolbar() {
  el("playBtn").addEventListener("click", () => {
    if (state.isSpeaking) togglePause();
    else startSpeaking();
  });
  el("stopBtn").addEventListener("click", stopSpeaking);

  el("rateSlider").addEventListener("input", (e) => {
    state.rate = parseFloat(e.target.value);
    el("rateLabel").textContent = state.rate.toFixed(2) + "x";
  });

  el("voiceSelect").addEventListener("change", (e) => {
    state.voiceURI = e.target.value;
  });

  el("uploadBtn").addEventListener("click", () => el("fileInput").click());
  el("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.text = String(ev.target.result || "");
      stopSpeaking();
      renderReadingText();
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  el("editBtn").addEventListener("click", () => {
    el("draftTextarea").value = state.text;
    el("editWrap").style.display = "block";
    el("readingCard").style.display = "none";
    el("draftTextarea").focus();
  });

  el("saveEditBtn").addEventListener("click", () => {
    state.text = el("draftTextarea").value;
    stopSpeaking();
    el("editWrap").style.display = "none";
    el("readingCard").style.display = "block";
    renderReadingText();
  });

  el("cancelEditBtn").addEventListener("click", () => {
    el("editWrap").style.display = "none";
    el("readingCard").style.display = "block";
  });
}

function init() {
  setupToolbar();
  renderReadingText();
  renderPanel();
  renderPlayButton();

  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
