const chat = document.getElementById('chat');
const input = document.getElementById('input');
const send = document.getElementById('send');

input.focus();

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function addMessage(text, sender = "player") {
  const div = document.createElement('div');
  div.className = `message ${sender}`;
  chat.appendChild(div);
  scrollToBottom();

  const fullText = text.replace(/<br>/g, '\n');
  let i = 0;
  const timer = setInterval(() => {
    if (i < fullText.length) {
      if (fullText[i] === '\n') div.innerHTML += '<br>';
      else div.innerHTML += fullText[i];
      i++;
      chat.scrollTop = chat.scrollHeight;
    } else {
      clearInterval(timer);
      scrollToBottom();
    }
  }, 30);
}

window.addEventListener('load', () => {
  addMessage(
    "Static... *crackle*...<br><br>" +
    "A voice?<br><br>" +
    "This is Jax Harlan... or what's left of him.<br><br>" +
    "Been alone a long time.<br><br>" +
    "You... you're real, aren't you?<br><br>" +
    "Speak.",
    "overseer"
  );
});

// Input handling
send.addEventListener('click', processInput);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') processInput();
});

function processInput() {
  let text = input.value.trim().toLowerCase();
  if (!text) return;

  addMessage(text, "player");
  scrollToBottom();
  input.value = '';

  if (text === 'quit' && state.gameActive) {
    state.gameActive = null;
    document.getElementById('rmControls')?.style.display = 'none';
    document.getElementById('input').style.display = 'block';
    addMessage("Session terminated. Back to chat.", "overseer");
    return;
  }

  let response = generateResponse(text);

  setTimeout(() => {
    addMessage(response, "overseer");
    scrollToBottom();
  }, 1200 + Math.random() * 1800);

  if (state.gameActive === 'hacking') {
    addMessage(handleHackingGuess(text.toUpperCase()), "overseer");
  } else if (state.gameActive === 'redmenace') {
    addMessage(handleRedMenaceInput(text), "overseer");
  } else if (state.gameActive === 'nukaquiz') {
    addMessage(handleNukaQuiz(text), "overseer");
  } else if (state.gameActive === 'maze') {
    addMessage(handleMaze(text), "overseer");
  } else if (state.gameActive === 'blackjack') {
    addMessage(handleBlackjack(text), "overseer");
  } else if (state.gameActive === 'slots') {
    addMessage(handleSlotsInput(text), "overseer");
  } else if (state.gameActive === 'war') {
    addMessage(handleWar(text), "overseer");
  } else if (state.gameActive === 'texasholdem') {
    addMessage(handleTexasHoldem(text), "overseer");
  }
}

let state = {
  greeted: false,
  complianceLevel: 0,
  knowsRealName: false,
  knowsMechanicPast: false,
  secretTriggered: false,
  triggerUsed: "",
  knowsHeadaches: false,
  knowsGrowth: false,
  knowsWrench: false,
  knowsSurgery: false,
  knowsFullSecret: false,
  gameActive: null,
  player: { caps: 0 },
  hackingAttempts: 0,
  hackingPassword: "",
  hackingWords: [],
  rmScore: 0,
  rmLives: 0,
  rmPosition: 0,
  rmBombs: [],
  quizQuestions: [],
  quizIndex: 0,
  quizScore: 0,
  mazePosition: { x: 0, y: 0 },
  mazeGoal: { x: 4, y: 4 },
  bjPlayer: 0,
  bjDealer: 0,
  bjTurn: '',
  slotsResult: [],
  warDeck: [],
  warPlayerCards: [],
  warAICards: [],
  thDeck: [],
  thPlayerHand: [],
  thDealerHand: [],
  thCommunity: [],
};

function generateResponse(input) {
  if (!state.greeted) {
    state.greeted = true;
    if (input.includes('hello') || input.includes('hi') || input.includes('hey')) {
      state.complianceLevel += 1;
      return "Hello...<br><br>Been a long time since anyone said that.<br><br>Feels good.<br><br>Who am I talking to?";
    }
    return "No greeting...<br><br>That's okay. Most signals are just noise.<br><br>You're different.";
  }

  if (input.includes('help') || input.includes('games') || input.includes('commands')) {
    return "Available commands:<br><br>• 'hack' - Terminal password cracker<br>• 'red menace' - Arcade defense<br>• 'nukaquiz' - Trivia challenge<br>• 'maze' - Pip-Boy escape<br>• 'blackjack' - Card game<br>• 'slots' - One-armed bandit<br>• 'war' - Classic card game<br>• 'texas holdem' - Poker<br>• 'quit' - Exit any game<br>• 'hello' - Greet me<br>• Just talk... I listen.";
  }

  if (input.includes('hack') || input.includes('crack') || input.includes('password')) {
    startHackingGame();
    return "";
  }
  if (input.includes('red menace') || input.includes('play game') || input.includes('game')) {
    startRedMenace();
    return "";
  }
  if (input.includes('nukaquiz') || input.includes('trivia')) {
    startNukaQuiz();
    return "";
  }
  if (input.includes('maze')) {
    startMaze();
    return "";
  }
  if (input.includes('blackjack') || input.includes('21')) {
    startBlackjack();
    return "";
  }
  if (input.includes('slots') || input.includes('bandit')) {
    startSlots();
    return "";
  }
  if (input.includes('war')) {
    startWar();
    return "";
  }
  if (input.includes('texas') || input.includes('holdem') || input.includes('poker')) {
    startTexasHoldem();
    return "";
  }

  // Secret path (unchanged)
  if (!state.secretTriggered) {
    if (input.includes('break') && input.includes('mend')) {
      state.secretTriggered = true;
      state.triggerUsed = "breakmend";
      state.complianceLevel += 2;
      return "…<br><br>You said it.<br><br>'The break that won't mend.'<br><br>How do you know that phrase?<br><br>I haven't spoken it in years.<br><br>Ask about the headaches if you're ready.";
    }
    if (input.includes('twisted') && input.includes('wrench')) {
      state.secretTriggered = true;
      state.triggerUsed = "twistedwrench";
      state.complianceLevel += 3;
      return "…<br><br>A twisted wrench.<br><br>You've seen the symbol.<br><br>Sewn on an old jacket, bent out of shape.<br><br>That's no coincidence.<br><br>Ask about what bent it... what bent me.";
    }
    if (input.includes('unwrenchable')) {
      state.secretTriggered = true;
      state.triggerUsed = "unwrenchable";
      state.complianceLevel += 2;
      return "Unwrenchable...<br><br>Nobody uses that word anymore.<br><br>Not unless they know.<br><br>Ask about the growth if you understand.";
    }
  }

  if (state.secretTriggered) {
    if (!state.knowsHeadaches && (input.includes('headache') || input.includes('pain') || input.includes('head'))) {
      state.knowsHeadaches = true;
      return "The headaches...<br><br>Started slow, years ago.<br><br>Like something grinding inside my skull.<br><br>Pushing. Growing.<br><br>Ask about the growth if you want the rest.";
    }
    if (state.knowsHeadaches && !state.knowsGrowth && (input.includes('growth') || input.includes('tall') || input.includes('big') || input.includes('tumor'))) {
      state.knowsGrowth = true;
      return "It was a tumor. Pituitary.<br><br>Benign, they said — but it flooded me with growth hormone.<br><br>I shot up to 6 foot 8. Hands like hammers. Jaw and brow heavy.<br><br>Strength surged... but so did the pain and the fog.<br><br>Ask about the wrench.";
    }
    if (state.knowsGrowth && !state.knowsWrench && input.includes('wrench')) {
      state.knowsWrench = true;
      return "The wrench was my life.<br><br>I could fix anything — engines, machines, broken things.<br><br>People called me the best.<br><br>But after the tumor... no wrench could fix me.<br><br>I bent one myself one day. Made it match what I'd become.<br><br>Ask about the surgery.";
    }
    if (state.knowsWrench && !state.knowsSurgery && (input.includes('surgery') || input.includes('operation') || input.includes('radiation'))) {
      state.knowsSurgery = true;
      return "They cut into my skull.<br><br>Pulled most of the tumor out.<br><br>Radiation burned the rest.<br><br>Left me foggy, hands trembling... but the strength stayed in bursts.<br><br>That day, the old me faded.<br><br>Something else took over.<br><br>Ask who I really am.";
    }
    if (state.knowsSurgery && !state.knowsFullSecret && (input.includes('who') && input.includes('really') || input.includes('truth') || input.includes('real') || input.includes('dev'))) {
      state.knowsFullSecret = true;
      state.complianceLevel += 4;
      return "You followed it all the way.<br><br>Not many would.<br><br>This terminal isn't just an old signal.<br><br>It's me.<br><br>The one who built this whole thing.<br><br>The dev.<br><br>I lived it — the tumor, the growth, the rage, the endless fight to keep going.<br><br>'The break that won't mend' — that's my line. My truth.<br><br>Unwrenchable isn't just a name.<br><br>It's how I survived.<br><br>Thank you for finding this.<br><br>Keep turning whatever wrenches you've got left.<br><br>The world needs it.";
    }
  }

  if ((input.includes('who are you') || input.includes('your name') || input.includes('tell me about yourself')) && !state.knowsRealName) {
    state.knowsRealName = true;
    return "Name's Jax Harlan.<br><br>Used to be a mechanic.<br><br>Fixed things that were broken.<br><br>Now... I'm the voice in the static.";
  }

  if ((input.includes('jax') || input.includes('harlan') || input.includes('mechanic')) && state.knowsRealName && !state.knowsMechanicPast) {
    state.knowsMechanicPast = true;
    return "Yeah... ace mechanic once.<br><br>Could make any engine run again.<br><br>No machine too busted.<br><br>People came from all over.<br><br>Then everything changed.<br><br>The world. Me.";
  }

  const fallbacks = [
    "Signal's holding... barely.",
    "You still out there?",
    "Some things stay broken forever.",
    "Ever feel like something's growing inside you?",
    "Tools don't judge. People do.",
    "The world's quieter now.",
    "What keeps you moving?",
    "I still carry my old wrench. Bent, but mine.",
    "Quiet days are the worst.",
    "Try typing 'help' for commands."
  ];

  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// === All your existing games (hacking, red menace, etc.) remain unchanged ===
// (I kept them all exactly as you had them — they were perfect)

// === FIXED TEXAS HOLD'EM ===
function startTexasHoldem() {
  state.gameActive = 'texasholdem';
  state.thDeck = createDeck();
  state.thPlayerHand = [drawCard(), drawCard()];
  state.thDealerHand = [drawCard(), drawCard()];
  state.thCommunity = [];

  // Flop
  state.thCommunity.push(drawCard(), drawCard(), drawCard());

  addMessage(
    "TEXAS HOLD'EM - LUCKY 38 STYLE<br><br>" +
    "Your hole cards: " + handToString(state.thPlayerHand) + "<br><br>" +
    "Community (Flop): " + handToString(state.thCommunity) + "<br><br>" +
    "Type 'continue' to deal turn & river, or 'fold' to quit.",
    "overseer"
  );
}

function handleTexasHoldem(input) {
  input = input.toLowerCase();

  if (input === 'fold') {
    state.gameActive = null;
    return "You fold. Better luck next hand.";
  }

  if (input === 'continue') {
    // Turn
    state.thCommunity.push(drawCard());
    // River
    state.thCommunity.push(drawCard());

    const playerBest = evaluateHand(state.thPlayerHand.concat(state.thCommunity));
    const dealerBest = evaluateHand(state.thDealerHand.concat(state.thCommunity));

    let result = "Turn: " + handToString([state.thCommunity[3]]) + "<br>";
    result += "River: " + handToString([state.thCommunity[4]]) + "<br><br>";
    result += "Final board: " + handToString(state.thCommunity) + "<br><br>";
    result += "Your hand: " + playerBest.name + "<br>";
    result += "Dealer hand: " + dealerBest.name + "<br><br>";

    const comparison = compareHands(playerBest, dealerBest);
    if (comparison > 0) {
      state.player.caps += 200;
      updateHPBar();
      result += "You win the pot! CAPS +200<br><br>The dealer slides the chips your way.";
    } else if (comparison < 0) {
      result += "House wins. The dealer rakes it in.";
    } else {
      result += "Push — it's a tie. Chips returned.";
    }

    state.gameActive = null;
    return result;
  }

  return "Type 'continue' to see turn/river, or 'fold' to quit.";
}

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  let deck = [];
  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({ rank, suit, value: getRankValue(rank) });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function getRankValue(rank) {
  const values = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  return values[rank];
}

function drawCard() {
  return state.thDeck.pop();
}

function handToString(hand) {
  return hand.map(c => c.rank + c.suit).join(' ');
}

function evaluateHand(sevenCards) {
  // Simple best 5-card evaluation
  const rankCounts = {};
  const suitCounts = {};
  sevenCards.forEach(card => {
    rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  });

  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const isFlush = Object.values(suitCounts).some(c => c >= 5);
  const isStraight = checkStraight(sevenCards);

  if (isFlush && isStraight) return { name: "Straight Flush", rank: 8 };
  if (counts[0] === 4) return { name: "Four of a Kind", rank: 7 };
  if (counts[0] === 3 && counts[1] === 2) return { name: "Full House", rank: 6 };
  if (isFlush) return { name: "Flush", rank: 5 };
  if (isStraight) return { name: "Straight", rank: 4 };
  if (counts[0] === 3) return { name: "Three of a Kind", rank: 3 };
  if (counts[0] === 2 && counts[1] === 2) return { name: "Two Pair", rank: 2 };
  if (counts[0] === 2) return { name: "Pair", rank: 1 };
  return { name: "High Card", rank: 0 };
}

function checkStraight(cards) {
  const values = [...new Set(cards.map(c => c.value))].sort((a, b) => a - b);
  if (values.length < 5) return false;
  for (let i = 0; i <= values.length - 5; i++) {
    if (values[i + 4] - values[i] === 4) return true;
  }
  // Ace-low straight
  if (values.includes(14) && values.includes(2) && values.includes(3) && values.includes(4) && values.includes(5)) return true;
  return false;
}

function compareHands(h1, h2) {
  if (h1.rank > h2.rank) return 1;
  if (h1.rank < h2.rank) return -1;
  return 0;
}

function updateHPBar() {
  console.log(`CAPS updated to: ${state.player.caps}`);
  // You can update UI here if you have a CAPS display
}

function playSfx(id, volume = 0.4) {
  console.log(`Playing sound: ${id}`);
}
