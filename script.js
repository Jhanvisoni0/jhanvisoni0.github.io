document.addEventListener('DOMContentLoaded', () => {
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

  // ---- Scroll reveal for each layer section ----
  const revealTargets = document.querySelectorAll('.layer');
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

  // ---- Custom cursor (only runs where CSS enables it: fine pointer + hover support) ----
  const canUseCustomCursor = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const dot = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');

  if (canUseCustomCursor && dot && ring) {
    const HOVER_SELECTOR = 'a, button, .project-tile, .project-hero-tile, .stack-item, ' +
      '.skill-card, .principle, .timeline-item, .chip, .blog-card, .cert-item, .contact-link';
    const TEXT_SELECTOR = 'p, li, h1, h2, h3, h4';

    let shown = false;

    document.addEventListener('mousemove', (e) => {
      dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      ring.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      if (!shown) {
        dot.classList.add('is-visible');
        ring.classList.add('is-visible');
        shown = true;
      }
    });

    document.addEventListener('mouseleave', () => {
      dot.classList.remove('is-visible');
      ring.classList.remove('is-visible');
      shown = false;
    });

    document.addEventListener('mouseover', (e) => {
      const hoverTarget = e.target.closest(HOVER_SELECTOR);
      const textTarget = !hoverTarget && e.target.closest(TEXT_SELECTOR);
      ring.classList.toggle('is-hovering', Boolean(hoverTarget));
      ring.classList.toggle('is-text', Boolean(textTarget));
    });
  }
});
