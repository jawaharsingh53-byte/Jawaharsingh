// ===== Navbar scroll effect =====
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// ===== Mobile nav toggle =====
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('active');
    navLinks.classList.toggle('active');
});

// Close mobile nav on link click
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navLinks.classList.remove('active');
    });
});

// ===== Active nav link on scroll =====
const sections = document.querySelectorAll('section[id]');
window.addEventListener('scroll', () => {
    const scrollY = window.scrollY + 100;
    sections.forEach(section => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        const id = section.getAttribute('id');
        const link = document.querySelector(`.nav-links a[href="#${id}"]`);
        if (link) {
            link.classList.toggle('active', scrollY >= top && scrollY < top + height);
        }
    });
});

// ===== Fade-in on scroll (IntersectionObserver) =====
const fadeElements = document.querySelectorAll('.fade-in');
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            // Stagger animation for sibling elements
            const siblings = entry.target.parentElement.querySelectorAll('.fade-in');
            const siblingIndex = Array.from(siblings).indexOf(entry.target);
            setTimeout(() => {
                entry.target.classList.add('visible');
            }, siblingIndex * 100);
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

fadeElements.forEach(el => observer.observe(el));

// ===== Smooth scroll for all anchor links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// ===== Featured Research: Accordion toggle =====
document.querySelectorAll('.findings-toggle').forEach(button => {
    button.addEventListener('click', () => {
        const content = button.nextElementSibling;
        const isExpanded = button.getAttribute('aria-expanded') === 'true';

        button.setAttribute('aria-expanded', !isExpanded);

        if (isExpanded) {
            content.classList.remove('open');
            setTimeout(() => { content.hidden = true; }, 400);
        } else {
            content.hidden = false;
            // Trigger reflow before adding class for transition
            content.offsetHeight;
            content.classList.add('open');
        }
    });
});

// ===== Re-observe new fade-in elements (Featured Research) =====
document.querySelectorAll('#featured .fade-in').forEach(el => {
    if (!el.classList.contains('visible')) {
        observer.observe(el);
    }
});

// ===== Interactive Graphical Abstract: Tooltip on hover =====
(function() {
    var tip = document.getElementById('abstractTooltip');
    var container = document.querySelector('.interactive-abstract');

    var nodes = document.querySelectorAll('.pathway-node[data-tooltip]');
    for (var i = 0; i < nodes.length; i++) {
        (function(node) {
            node.onmouseenter = function() {
                var text = node.getAttribute('data-tooltip');
                if (!text || !tip || !container) return;
                tip.textContent = text;
                var cr = container.getBoundingClientRect();
                var nr = node.getBoundingClientRect();
                tip.style.left = (nr.left + nr.width / 2 - cr.left) + 'px';
                tip.style.top = (nr.top - cr.top) + 'px';
                tip.style.bottom = 'auto';
                tip.classList.add('visible');
            };
            node.onmouseleave = function() {
                if (tip) tip.classList.remove('visible');
            };
        })(nodes[i]);
    }

    // Pi deficiency toggle is handled via inline onclick in HTML
})();

// ===== Auto-update copyright year =====
(function() {
    var el = document.getElementById('copyrightYear');
    if (el) el.textContent = new Date().getFullYear();
})();
