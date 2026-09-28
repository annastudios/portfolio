const termBody = document.getElementById('terminalBody');
const termInput = document.getElementById('terminalInput');

function printLine(html, className) {
  const p = document.createElement('p');
  p.className = 'term-line' + (className ? ' ' + className : '');
  p.innerHTML = html;
  termBody.appendChild(p);
  termBody.scrollTop = termBody.scrollHeight;
}

const jokes = [
  'My RAG pipeline cites its sources. Which is more than I can say for my confidence in standups.',
  'I asked the LLM to be concise. It replied with a 400-word apology for being verbose.',
  'Serverless means there are still servers. They just have better PR than I do.',
  'Cold start: what Lambda has in the morning. Also what I have in the morning.',
  'Retry logic is just optimism with exponential backoff.',
  'There are 10 kinds of people: those who understand binary, and those who were promised this would be a joke.',
  'A SQL query walks into a bar, sees two tables, and asks: "Can I JOIN you?"',
  'Why did the developer go broke? They used up all their cache.',
  'I have a joke about UDP, but I\'m not sure you\'ll get it.',
  '"It works on my machine." — Great, then we\'ll ship your machine.',
  'My code has zero bugs. It just has several undocumented features.',
  'Git blame is just version-controlled finger pointing.',
];
let lastJoke = -1;

const commands = {
  help() {
    printLine(
      'Available commands:\n' +
      '  <span class="term-cmd">whoami</span>    who is running this thing\n' +
      '  <span class="term-cmd">about</span>     a short bio\n' +
      '  <span class="term-cmd">skills</span>    stack and tools\n' +
      '  <span class="term-cmd">experience</span> where I\'ve worked\n' +
      '  <span class="term-cmd">projects</span>  what I\'ve built\n' +
      '  <span class="term-cmd">resume</span>    open my résumé\n' +
      '  <span class="term-cmd">contact</span>   how to reach me\n' +
      '  <span class="term-cmd">joke</span>      a (debatably) funny one\n' +
      '  <span class="term-cmd">date</span>      current date and time\n' +
      '  <span class="term-cmd">clear</span>     clear the screen'
    );
  },
  whoami() {
    printLine('ankita — software engineer, Pune, India.');
  },
  about() {
    printLine('Software engineer. Two years of production APIs and serverless AWS for healthcare at Accenture; lately, full-stack apps and RAG pipelines. Open to SDE roles and freelance work. See <a href="#about">#about</a>.');
  },
  skills() {
    printLine('Python, REST APIs, FastAPI, AWS Lambda, PostgreSQL, TypeScript, React/Next.js, RAG. Full list: <a href="#skills">#skills</a>.');
  },
  experience() {
    printLine(
      'Associate Software Engineer, Accenture (Jun 2024 – Jul 2026)\n' +
      '  • recovered 200K+ failed enrollments, 60% less manual reprocessing\n' +
      '  • shipped 23 REST APIs on Lambda + API Gateway, 15K peak daily requests\n' +
      '  • cut failure detection from days to minutes with CloudWatch alarms\n' +
      'More: <a href="#experience">#experience</a>'
    );
  },
  projects() {
    printLine(
      '<a href="https://github.com/annastudios/askive" target="_blank" rel="noopener">askive/</a>      chat with your documents; answers cite their sources\n' +
      '<a href="https://github.com/annastudios/lantern-journal" target="_blank" rel="noopener">lantern/</a>     private journal: magic links, RLS, Next.js + Supabase\n' +
      '<a href="https://github.com/annastudios/Algo-Sonic" target="_blank" rel="noopener">algo-sonic/</a>  hear 8 sorting and searching algorithms\n' +
      'Details: <a href="#projects">#projects</a>'
    );
  },
  resume() {
    printLine('Opening résumé in a new tab… (or <a href="resume.pdf" target="_blank" rel="noopener">click here</a>)', 'term-muted');
    window.open('resume.pdf', '_blank', 'noopener');
  },
  contact() {
    printLine('Email: <a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=ankita.gaikwad1607@gmail.com" target="_blank" rel="noopener" data-mailto="ankita.gaikwad1607@gmail.com">ankita.gaikwad1607@gmail.com</a> — or see <a href="#contact">#contact</a> for socials.');
  },
  joke() {
    // never the same joke twice in a row
    let i;
    do { i = Math.floor(Math.random() * jokes.length); } while (jokes.length > 1 && i === lastJoke);
    lastJoke = i;
    printLine(jokes[i]);
  },
  date() {
    printLine(new Date().toString());
  },
  clear() {
    termBody.innerHTML = '';
  },
  ls() {
    printLine('about.txt  skills.md  projects/  contact.txt', 'term-muted');
  },
  'cat about.txt': function () { commands.about(); },
};

function runCommand(raw) {
  const input = raw.trim();
  printLine('<span class="term-cmd">ankita@portfolio:~$</span> ' + escapeHtml(input), 'term-echo');

  if (!input) return;

  const lower = input.toLowerCase();

  if (lower.startsWith('sudo')) {
    printLine("Permission denied: you're not root here.", 'term-error');
    return;
  }

  // own keys only — a plain lookup also finds inherited ones like __proto__ / constructor
  if (Object.hasOwn(commands, lower)) {
    commands[lower]();
    return;
  }

  printLine('command not found: ' + escapeHtml(input) + " — type 'help' for a list of commands.", 'term-error');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// autoplay: type one command on load so visitors can see the terminal is live.
// Any interaction first cancels it, so it never fights the visitor.
let autoplayCancelled = false;
const cancelAutoplay = () => { autoplayCancelled = true; };

function autoplay(cmd) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    runCommand(cmd);
    return;
  }
  let i = 0;
  const typeNext = () => {
    if (autoplayCancelled) { termInput.value = ''; return; }
    if (i < cmd.length) {
      termInput.value += cmd[i++];
      setTimeout(typeNext, 90 + Math.random() * 60);
    } else {
      setTimeout(() => {
        if (autoplayCancelled) { termInput.value = ''; return; }
        runCommand(cmd);
        termInput.value = '';
      }, 350);
    }
  };
  typeNext();
}

document.querySelectorAll('.term-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    cancelAutoplay();
    termInput.value = '';
    runCommand(chip.dataset.cmd);
  });
});

if (termInput) {
  termInput.addEventListener('focus', cancelAutoplay);
  setTimeout(() => { if (!autoplayCancelled) autoplay('whoami'); }, 1200);

  termInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      runCommand(termInput.value);
      termInput.value = '';
    }
  });

  document.querySelector('.terminal-body').addEventListener('click', () => termInput.focus());
}
