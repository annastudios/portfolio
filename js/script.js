document.getElementById('year').textContent = new Date().getFullYear();

/* email links open Gmail compose in a new tab (mailto does nothing on computers without a
   mail app); phones always have a mail app and Gmail's web compose is unreliable there, so they use mailto */
if (window.matchMedia('(pointer: coarse)').matches) {
  document.querySelectorAll('a[data-mailto]').forEach((link) => {
    link.href = 'mailto:' + link.dataset.mailto;
    link.removeAttribute('target');
  });
}

/* mobile nav */
const navToggle = document.getElementById('navToggle');
const mobileNav = document.getElementById('mobileNav');

if (navToggle && mobileNav) {
  const closeMenu = () => {
    document.body.classList.remove('menu-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Open menu');
  };
  const openMenu = () => {
    document.body.classList.add('menu-open');
    navToggle.setAttribute('aria-expanded', 'true');
    navToggle.setAttribute('aria-label', 'Close menu');
  };

  navToggle.addEventListener('click', () => {
    document.body.classList.contains('menu-open') ? closeMenu() : openMenu();
  });

  mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
      closeMenu();
      navToggle.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('menu-open') && !mobileNav.contains(e.target) && !navToggle.contains(e.target)) {
      closeMenu();
    }
  });
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* cursor spotlight */
if (!reduceMotion) {
  const spotlight = document.querySelector('.spotlight');
  window.addEventListener('pointermove', (e) => {
    spotlight.style.setProperty('--x', `${e.clientX}px`);
    spotlight.style.setProperty('--y', `${e.clientY}px`);
  });
}

/* magnetic buttons */
if (!reduceMotion) {
  document.querySelectorAll('.magnetic').forEach((el) => {
    const strength = 0.35;
    el.addEventListener('mousemove', (e) => {
      // the rect already includes our own translate (mid-transition, too), so measuring
      // from it feeds the offset back into itself and jitters — subtract it to get the resting center
      const rect = el.getBoundingClientRect();
      const { m41: tx, m42: ty } = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      const x = e.clientX - (rect.left - tx) - rect.width / 2;
      const y = e.clientY - (rect.top - ty) - rect.height / 2;
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = '';
    });
  });
}

/* scroll reveal */
const revealEls = document.querySelectorAll('.reveal');
if (reduceMotion) {
  revealEls.forEach((el) => el.classList.add('in-view'));
} else {
  let pending = Array.from(revealEls);
  const checkReveal = () => {
    pending = pending.filter((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight * 0.92) return true;
      el.classList.add('in-view');
      return false;
    });
    if (!pending.length) {
      window.removeEventListener('scroll', checkReveal);
      window.removeEventListener('resize', checkReveal);
    }
  };
  window.addEventListener('scroll', checkReveal, { passive: true });
  window.addEventListener('resize', checkReveal);
  checkReveal();
}

// contact doodle: current time in Pune, so visitors abroad see the timezone
const puneTime = document.getElementById('puneTime');
if (puneTime) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
  const tick = () => { puneTime.textContent = "it's " + fmt.format(new Date()).toLowerCase() + ' here'; };
  tick();
  setInterval(tick, 30000);
}
