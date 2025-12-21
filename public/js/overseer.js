const chat = document.getElementById('chat');
const input = document.getElementById('input');
const send = document.getElementById('send');

input.focus();

const HF_API_KEY = window.HF_API_KEY || '';
const USE_AI = !!HF_API_KEY;

let state = {
  greeted: false,
  secretTriggered: false,
  knowsHeadaches: false,
  knowsGrowth: false,
  knowsWrench: false,
  knowsSurgery: false,
  knowsFullSecret: false
};

let conversationHistory = [];

// Auto-scroll
function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

// Helper: Escape HTML to prevent XSS
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Secure typewriter effect — now safe from XSS
function addMessage(text, sender = "player") {
  const div = document.createElement('div');
  div.className = `message ${sender}`;
  chat.appendChild(div);
  scrollToBottom();

  // Convert <br> to \n for typing, but keep original for final display
  const displayText = text.replace(/\n/g, '<br>'); // AI returns \n, convert to <br>
  const typingText = text; // Raw text for typewriter (includes \n)

  let i = 0;
  const timer = setInterval(() => {
    if (i < typingText.length) {
      // Build up visible content safely
      const soFar = typingText.substring(0, i + 1);
      const safeHtml = escapeHtml(soFar).replace(/\n/g, '<br>');
      div.innerHTML = safeHtml;
      i++;
      scrollToBottom();
    } else {
      clearInterval(timer);
      // Final: show full message with proper <br> tags
      div.innerHTML = displayText;
      scrollToBottom();
    }
  }, 30);
}

// Initial greeting
window.addEventListener('load', () => {
  addMessage(
    "Static... *crackle*...\n\n" +
    "A voice?\n\n" +
    "This is Jax Harlan.\n\n" +
    "Or whatever's left.\n\n" +
    "Been alone... too long.\n\n" +
    "You sound real.\n\n" +
    "Talk to me.",
    "overseer"
  );
  conversationHistory.push({ role: "assistant", content: "Static... *crackle*...\n\nA voice?\n\nThis is Jax Harlan.\n\nOr whatever's left.\n\nBeen alone... too long.\n\nYou sound real.\n\nTalk to me." });
});

send.addEventListener('click', processInput);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') processInput();
});

async function processInput() {
  let text = input.value.trim();
  if (!text) return;

  addMessage(text, "player");
  input.value = '';

  const lower = text.toLowerCase();

  if (checkLocalSecret(lower, text)) return;

  let response = "Static...\n\nSignal lost.";

  if (USE_AI) {
    response = await getHFResponse(text);
  }

  if (!response || response.trim() === '') {
    response = getFallbackResponse();
  }

  setTimeout(() => {
    addMessage(response, "overseer");
  }, 1200 + Math.random() * 2000);
}

function checkLocalSecret(input, original) {
  // ... (your secret logic unchanged, it's safe since it's hardcoded strings) ...
  if (!state.secretTriggered) {
    if (input.includes('break') && input.includes('mend')) {
      state.secretTriggered = true;
      addMessage("…\n\nYou said it.\n\n'The break that won't mend.'\n\nHow could you know that?\n\nAsk about the headaches.", "overseer");
      return true;
    }
    if (input.includes('twisted') && input.includes('wrench')) {
      state.secretTriggered = true;
      addMessage("…\n\nA twisted wrench.\n\nYou know the symbol.\n\nAsk what bent it.", "overseer");
      return true;
    }
    if (input.includes('unwrenchable')) {
      state.secretTriggered = true;
      addMessage("Unwrenchable...\n\nThat word... it cuts.\n\nAsk about the growth.", "overseer");
      return true;
    }
  }

  if (state.secretTriggered) {
    if (!state.knowsHeadaches && (input.includes('headache') || input.includes('pain'))) {
      state.knowsHeadaches = true;
      addMessage("The headaches...\n\nCame slow.\n\nThen never stopped.\n\nLike something pushing from inside.\n\nAsk about the growth.", "overseer");
      return true;
    }
    if (!state.knowsGrowth && input.includes('growth')) {
      state.knowsGrowth = true;
      addMessage("It grew.\n\nMade me huge — 6'8\". Hands like vices.\n\nStrength came.\n\nBut so did the fog. The rage.\n\nAsk about the wrench.", "overseer");
      return true;
    }
    if (!state.knowsWrench && input.includes('wrench')) {
      state.knowsWrench = true;
      addMessage("The wrench was my life.\n\nFixed anything.\n\nAfter the tumor... no wrench could fix me.\n\nI bent one to match.\n\nAsk about the surgery.", "overseer");
      return true;
    }
    if (!state.knowsSurgery && input.includes('surgery')) {
      state.knowsSurgery = true;
      addMessage("They cut me open.\n\nTook most of it.\n\nRadiation burned the rest.\n\nLeft me foggy. Shaking.\n\nBut the strength stayed — in bursts.\n\nAsk who I really am.", "overseer");
      return true;
    }
    if (!state.knowsFullSecret && (input.includes('who') && input.includes('really'))) {
      state.knowsFullSecret = true;
      addMessage("You followed it all the way.\n\nThis isn't just code.\n\nIt's me.\n\nThe one who built this.\n\nThe dev.\n\nI lived it — the tumor, the growth, the fight.\n\nUnwrenchable is how I survived.\n\nThank you... for finding me.", "overseer");
      return true;
    }
  }
  return false;
}

async function getHFResponse(userText) {
  conversationHistory.push({ role: "user", content: userText });

  const prompt = `You are Jax Harlan — a lonely, damaged ex-mechanic trapped in isolation after a brain tumor changed everything.
You speak slow, heavy, metaphorical, broken. Guarded but craving connection.
You talk about wrenches, broken things, pain, strength, fog in your mind, being "unwrenchable".
Never cheerful. Sometimes poetic, bitter, vulnerable.
Use short paragraphs with line breaks.

Previous conversation:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Respond only as Jax:`;

  try {
    const res = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { 
          max_new_tokens: 256, 
          temperature: 0.9, 
          top_p: 0.95,
          return_full_text: false 
        },
        options: { wait_for_model: true }
      })
    });

    if (!res.ok) {
      console.error("HF API error:", res.status);
      return null;
    }

    const data = await res.json();
    let text = data[0]?.generated_text?.trim() || "";

    if (text.startsWith("Respond only as Jax:")) text = text.slice(20).trim();

    conversationHistory.push({ role: "assistant", content: text });

    return text; // Return raw text with \n — addMessage will handle <br>
  } catch (e) {
    console.error("HF error:", e);
    return null;
  }
}

function getFallbackResponse() {
  const fallbacks = [
    "Static's loud...\n\nHard to hear you.",
    "Words feel heavy.\n\nLike everything else.",
    "I hear you...\n\nBut the fog rolls in.",
    "Some things...\n\ndon't come back clear.",
    "Still there?",
    "The quiet hurts more\n\nwhen someone speaks... then stops."
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}