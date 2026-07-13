// ==========================================================================
// Config: edit these two lines to change what the hero terminal "types"
// ==========================================================================
const LINE_1 = "Jhanvi Soni — Data Engineer | Databricks Platform Engineer | Analytics Engineer";
const LINE_2 = "Turn fragmented, multi-source data into trusted, production-ready pipelines.";

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Typewriter effect ----
function typeInto(el, text, speed, done) {
  if (!el) return;
  if (prefersReducedMotion) {
    el.textContent = text;
    if (done) done();
    return;
  }
  let i = 0;
  el.textContent = "";
  const interval = setInterval(() => {
    el.textContent += text.charAt(i);
    i++;
    if (i >= text.length) {
      clearInterval(interval);
      if (done) done();
    }
  }, speed);
}

document.addEventListener('DOMContentLoaded', () => {
  const line1El = document.getElementById('typeLine1');
  const line2El = document.getElementById('typeLine2');

  typeInto(line1El, LINE_1, 22, () => {
    setTimeout(() => typeInto(line2El, LINE_2, 18), 250);
  });

  // ---- Mobile nav toggle ----
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ---- Scroll reveal ----
  const revealTargets = document.querySelectorAll('.layer, .hero-inner');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealTargets.forEach(el => observer.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('in-view'));
  }
});
