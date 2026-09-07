/* ============================================================
   SkyPro X1 — main.js
   Boots the 3D hero scene and wires up the page interactions:
   scroll-linked drone motion, gallery carousel, reveal-on-scroll,
   mobile nav and the pre-order form.
   ============================================================ */

import { createDroneScene } from './drone.js';

/* ---------- 3D hero ---------- */
function initHeroScene() {
  const container = document.getElementById('hero-canvas');
  const hero = document.getElementById('hero');
  if (!container || !hero) return;

  const scene = createDroneScene(container, {
    onReady: () => hero.classList.add('is-ready'), // fades in the canvas
    onError: () => {
      // Leave the loader hidden and surface the static fallback banner.
      hero.classList.add('is-ready');
      const warning = document.getElementById('compat-warning');
      if (warning) warning.hidden = false;
    },
  });
  if (!scene) return;

  // Feed scroll progress (0 → 1 across the hero) to the drone:
  // it rises and spins faster as you scroll away.
  let ticking = false;
  const updateScroll = () => {
    ticking = false;
    const range = hero.offsetHeight || window.innerHeight;
    scene.setScrollProgress(window.scrollY / range);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateScroll);
      }
    },
    { passive: true }
  );
  updateScroll();
}

/* ---------- Header state + mobile nav ---------- */
function initHeader() {
  const header = document.getElementById('site-header');
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('site-nav');

  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  toggle?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  // Close the mobile menu after navigating.
  nav?.querySelectorAll('a').forEach((link) =>
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle?.setAttribute('aria-expanded', 'false');
    })
  );
}

/* ---------- Gallery carousel ---------- */
function initCarousel() {
  const root = document.getElementById('carousel');
  if (!root) return;

  const track = root.querySelector('.carousel-track');
  const slides = Array.from(track.children);
  const dotsWrap = root.querySelector('.carousel-dots');
  const AUTOPLAY_MS = 6000;

  let index = 0;
  let timer = null;

  const dots = slides.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dot.addEventListener('click', () => {
      go(i);
      restartAutoplay();
    });
    dotsWrap.appendChild(dot);
    return dot;
  });

  function go(n) {
    index = (n + slides.length) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
  }

  function startAutoplay() {
    timer = setInterval(() => go(index + 1), AUTOPLAY_MS);
  }
  function stopAutoplay() {
    clearInterval(timer);
    timer = null;
  }
  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  root.querySelector('#carousel-prev').addEventListener('click', () => { go(index - 1); restartAutoplay(); });
  root.querySelector('#carousel-next').addEventListener('click', () => { go(index + 1); restartAutoplay(); });

  // Pause while the user is reading / hovering / focused inside.
  root.addEventListener('pointerenter', stopAutoplay);
  root.addEventListener('pointerleave', startAutoplay);
  root.addEventListener('focusin', stopAutoplay);
  root.addEventListener('focusout', startAutoplay);

  // Keyboard support.
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { go(index - 1); restartAutoplay(); }
    if (e.key === 'ArrowRight') { go(index + 1); restartAutoplay(); }
  });

  // Light touch/swipe support.
  let touchX = null;
  root.addEventListener('pointerdown', (e) => { touchX = e.clientX; }, { passive: true });
  root.addEventListener('pointerup', (e) => {
    if (touchX === null) return;
    const dx = e.clientX - touchX;
    if (Math.abs(dx) > 40) { go(index + (dx < 0 ? 1 : -1)); restartAutoplay(); }
    touchX = null;
  }, { passive: true });

  go(0);
  startAutoplay();
}

/* ---------- Reveal-on-scroll ---------- */
function initReveals() {
  const elements = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    elements.forEach((el) => el.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  elements.forEach((el) => io.observe(el));
}

/* ---------- Pre-order form (front-end demo) ---------- */
function initPreorderForm() {
  const form = document.getElementById('preorder-form');
  const input = document.getElementById('preorder-email');
  const msg = document.getElementById('preorder-msg');
  if (!form || !input || !msg) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      msg.style.color = '#ff8a7a';
      msg.textContent = 'Please enter a valid email address.';
      return;
    }
    msg.style.color = '';
    msg.textContent = `Thanks — ${email} is on the list. We'll email you when pre-orders open.`;
    form.reset();
  });
}

/* ---------- Boot ---------- */
initHeader();
initHeroScene();
initCarousel();
initReveals();
initPreorderForm();

document.getElementById('year').textContent = new Date().getFullYear();

// Tells the file:// fallback check in index.html that the app booted fine.
window.__SKYPRO_BOOTED = true;
