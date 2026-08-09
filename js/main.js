// ===== Theme toggle (light / dark) =====
(function () {
    var root = document.documentElement;
    var toggle = document.getElementById('themeToggle');

    function current() {
        return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function label() {
        if (!toggle) return;
        toggle.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }

    function apply(theme) {
        root.setAttribute('data-theme', theme);
        try { localStorage.setItem('theme', theme); } catch (e) {}
        label();
    }

    if (toggle) {
        label();
        toggle.addEventListener('click', function () {
            apply(current() === 'dark' ? 'light' : 'dark');
        });
    }
})();

// ===== Navbar shadow on scroll (passive, rAF-guarded) =====
(function () {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;
    var ticking = false;
    function update() {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
        ticking = false;
    }
    window.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
})();

// ===== Mobile nav toggle (exposes state to assistive tech) =====
(function () {
    var navToggle = document.getElementById('navToggle');
    var navLinks = document.getElementById('navLinks');
    if (!navToggle || !navLinks) return;

    function setOpen(open) {
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        navLinks.classList.toggle('active', open);
    }

    navToggle.addEventListener('click', function () {
        setOpen(navToggle.getAttribute('aria-expanded') !== 'true');
    });

    navLinks.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () { setOpen(false); });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
            setOpen(false);
            navToggle.focus();
        }
    });
})();

// ===== Active nav link via IntersectionObserver (no per-scroll layout reads) =====
(function () {
    var sections = document.querySelectorAll('section[id]');
    var links = {};
    document.querySelectorAll('.nav-links a[href^="#"]').forEach(function (a) {
        links[a.getAttribute('href').slice(1)] = a;
    });
    if (!sections.length || !('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                var id = entry.target.getAttribute('id');
                Object.keys(links).forEach(function (key) {
                    links[key].classList.toggle('active', key === id);
                });
            }
        });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach(function (s) { io.observe(s); });
})();

// ===== Fade-in on scroll (IntersectionObserver) =====
(function () {
    var fadeElements = document.querySelectorAll('.fade-in');
    if (!('IntersectionObserver' in window)) {
        fadeElements.forEach(function (el) { el.classList.add('visible'); });
        return;
    }
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                var siblings = entry.target.parentElement.querySelectorAll('.fade-in');
                var siblingIndex = Array.prototype.indexOf.call(siblings, entry.target);
                setTimeout(function () { entry.target.classList.add('visible'); }, siblingIndex * 100);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    fadeElements.forEach(function (el) { observer.observe(el); });
})();

// ===== Stat reveal popovers (Countries / Crop Species) — tap to toggle =====
(function () {
    var reveals = document.querySelectorAll('.stat-item-reveal');
    reveals.forEach(function (item) {
        item.setAttribute('aria-expanded', 'false');

        function close() { item.classList.remove('active'); item.setAttribute('aria-expanded', 'false'); }
        function open() { item.classList.add('active'); item.setAttribute('aria-expanded', 'true'); }

        item.addEventListener('click', function (e) {
            e.stopPropagation();
            var wasActive = item.classList.contains('active');
            reveals.forEach(function (r) { r.classList.remove('active'); r.setAttribute('aria-expanded', 'false'); });
            if (!wasActive) open();
        });

        item.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                item.click();
            } else if (e.key === 'Escape') {
                close();
            }
        });
    });

    document.addEventListener('click', function () {
        reveals.forEach(function (r) { r.classList.remove('active'); r.setAttribute('aria-expanded', 'false'); });
    });
})();

// ===== Auto-update copyright year =====
(function () {
    var el = document.getElementById('copyrightYear');
    if (el) el.textContent = new Date().getFullYear();
})();
