/* لمسة المستقبل — progressive enhancement; content and links remain usable without JavaScript. */
(() => {
  'use strict';

  const select = (selector, scope = document) => scope.querySelector(selector);
  const selectAll = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const listenMotion = (callback) => {
    if (motion.addEventListener) motion.addEventListener('change', callback);
    else if (motion.addListener) motion.addListener(callback);
  };
  const arabicNumber = new Intl.NumberFormat('ar-SA');
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const rtl = document.documentElement.dir === 'rtl';

  /* Sticky header and an accessible mobile menu. */
  const header = select('[data-header]');
  if (header) {
    const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 32);
    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();
  }

  const menuToggle = select('[data-menu-toggle]');
  const mobileMenu = select('[data-mobile-menu]');
  if (menuToggle && mobileMenu) {
    const setMenu = (open) => {
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
      mobileMenu.hidden = !open;
      document.documentElement.classList.toggle('menu-open', open);
    };
    setMenu(false);
    menuToggle.addEventListener('click', () => {
      setMenu(menuToggle.getAttribute('aria-expanded') !== 'true');
    });
    mobileMenu.addEventListener('click', (event) => {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !mobileMenu.hidden) {
        setMenu(false);
        menuToggle.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (!mobileMenu.hidden && !mobileMenu.contains(event.target) && !menuToggle.contains(event.target)) {
        setMenu(false);
      }
    });
  }

  /* Pointer gestures retain normal vertical scrolling and do not consume taps. */
  const swipe = (element, previous, next) => {
    let start = null;
    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' || event.target.closest('button, a, input, textarea, select')) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    }, { passive: true });
    element.addEventListener('pointerup', (event) => {
      if (!start || start.id !== event.pointerId) return;
      const x = event.clientX - start.x;
      const y = event.clientY - start.y;
      start = null;
      if (Math.abs(x) < 45 || Math.abs(x) <= Math.abs(y) * 1.25) return;
      if ((rtl && x > 0) || (!rtl && x < 0)) next();
      else previous();
    }, { passive: true });
    element.addEventListener('pointercancel', () => { start = null; }, { passive: true });
  };

  const setupCarousel = (element, options) => {
    const slides = selectAll(options.slide, element);
    if (!slides.length) return;
    const previous = select(options.previous, element);
    const next = select(options.next, element);
    const dots = selectAll(options.dot, element);
    const pause = options.pause ? select(options.pause, element) : null;
    const current = options.current ? select(options.current, element) : null;
    const status = options.status ? select(options.status, element) : null;
    let index = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
    let timer = null;
    let userPaused = false;
    let hovered = false;
    let focused = element.contains(document.activeElement);
    let visible = true;

    const stop = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      stop();
      if (slides.length < 2 || userPaused || hovered || focused || !visible || document.hidden || motion.matches) return;
      const duration = clamp(Number(slides[index].dataset.duration) || options.duration || 5000, 4000, 6000);
      timer = window.setTimeout(() => show(index + 1, false), duration);
    };
    const updatePause = () => {
      if (!pause) return;
      const label = motion.matches ? 'العرض التلقائي متوقف لتقليل الحركة' : userPaused ? 'تشغيل العرض التلقائي' : 'إيقاف العرض التلقائي';
      pause.setAttribute('aria-label', label);
      pause.setAttribute('aria-pressed', String(userPaused));
      pause.title = label;
      pause.disabled = slides.length < 2 || motion.matches;
      const pauseLabel = select('[data-carousel-pause-label], [data-testimonial-pause-label]', pause);
      if (pauseLabel) pauseLabel.textContent = userPaused ? 'تشغيل العرض' : 'إيقاف العرض';
    };
    const show = (requested, manual = true) => {
      index = ((requested % slides.length) + slides.length) % slides.length;
      slides.forEach((slide, position) => {
        const active = position === index;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
        slide.inert = !active;
        if (options.useHidden) slide.hidden = !active;
      });
      dots.forEach((dot, position) => {
        const dotIndex = Number(dot.dataset.index ?? position);
        const active = dotIndex === index;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-pressed', String(active));
        dot.setAttribute('aria-label', 'عرض الصورة ' + arabicNumber.format(dotIndex + 1));
      });
      if (current) current.textContent = String(index + 1).padStart(2, '0');
      if (manual && status) status.textContent = 'الصورة ' + arabicNumber.format(index + 1) + ' من ' + arabicNumber.format(slides.length);
      schedule();
    };
    if (previous) {
      previous.disabled = slides.length < 2;
      previous.addEventListener('click', () => show(index - 1));
    }
    if (next) {
      next.disabled = slides.length < 2;
      next.addEventListener('click', () => show(index + 1));
    }
    dots.forEach((dot, position) => {
      dot.addEventListener('click', () => show(Number(dot.dataset.index ?? position)));
    });
    if (pause) pause.addEventListener('click', () => {
      userPaused = !userPaused;
      updatePause();
      schedule();
    });
    element.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      hovered = true;
      stop();
    });
    element.addEventListener('pointerleave', () => { hovered = false; schedule(); });
    element.addEventListener('focusin', () => { focused = true; stop(); });
    element.addEventListener('focusout', () => {
      window.setTimeout(() => {
        focused = element.contains(document.activeElement);
        schedule();
      }, 0);
    });
    element.addEventListener('keydown', (event) => {
      if (event.target.matches('input, textarea, select') || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = (rtl && event.key === 'ArrowLeft') || (!rtl && event.key === 'ArrowRight') ? 1 : -1;
        show(index + direction);
      }
    });
    swipe(element, () => show(index - 1), () => show(index + 1));
    document.addEventListener('visibilitychange', schedule);
    listenMotion(() => { updatePause(); schedule(); });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        schedule();
      }, { threshold: 0.05 });
      observer.observe(element);
    }
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', schedule);
    updatePause();
    show(index, false);
  };

  selectAll('[data-carousel]').forEach((element) => setupCarousel(element, {
    slide: '[data-slide]', previous: '[data-carousel-prev]', next: '[data-carousel-next]',
    dot: '[data-carousel-dot]', pause: '[data-carousel-pause]', current: '[data-slide-current]',
    status: '[data-carousel-status]', duration: 5000
  }));
  selectAll('[data-testimonials]').forEach((element) => setupCarousel(element, {
    slide: '[data-testimonial]', previous: '[data-testimonial-prev]', next: '[data-testimonial-next]',
    dot: '[data-testimonial-dot]', pause: '[data-testimonial-pause]', current: '[data-testimonial-current]', duration: 6000, useHidden: true
  }));

  /* Gallery filtering is independent from image navigation. */
  selectAll('[data-gallery]').forEach((gallery) => {
    const filters = selectAll('[data-filter]', gallery);
    const items = selectAll('[data-gallery-item]', gallery);
    const count = select('[data-gallery-count]', gallery);
    filters.forEach((filter) => {
      filter.addEventListener('click', () => {
        const category = filter.dataset.filter;
        let visibleItems = 0;
        items.forEach((item) => {
          const categories = (item.dataset.categories || '').split('|').map((value) => value.trim());
          const visible = category === 'الكل' || categories.includes(category);
          item.hidden = !visible;
          if (visible) visibleItems += 1;
        });
        filters.forEach((button) => {
          const active = button === filter;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        if (count) count.textContent = arabicNumber.format(visibleItems) + ' أعمال';
      });
    });
  });

  const safeURL = (value) => {
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url : null;
    } catch { return null; }
  };

  /* Native dialog provides focus trapping and Escape semantics. */
  const dialog = select('[data-lightbox-dialog]');
  if (dialog && typeof dialog.showModal === 'function') {
    const image = select('[data-lightbox-image]', dialog);
    const title = select('[data-lightbox-title]', dialog);
    const project = select('[data-lightbox-project]', dialog);
    const previous = select('[data-lightbox-prev]', dialog);
    const next = select('[data-lightbox-next]', dialog);
    const close = select('[data-lightbox-close]', dialog);
    const count = select('[data-lightbox-count]', dialog);
    let links = [];
    let index = 0;
    let trigger = null;
    let scrollLockedBefore = false;

    const navigate = (requested) => {
      if (!links.length || !image) return;
      index = ((requested % links.length) + links.length) % links.length;
      const link = links[index];
      const source = safeURL(link.href);
      if (!source) return;
      const caption = link.dataset.title || select('img', link)?.alt || 'من أعمال لمسة المستقبل';
      dialog.classList.add('is-loading');
      dialog.classList.remove('has-image-error');
      image.alt = caption;
      image.src = source.href;
      if (title) title.textContent = caption;
      if (count) count.textContent = arabicNumber.format(index + 1) + ' / ' + arabicNumber.format(links.length);
      if (project) {
        const projectURL = safeURL(link.dataset.projectUrl || '');
        project.hidden = !link.dataset.projectUrl || !projectURL || projectURL.origin !== window.location.origin;
        if (!project.hidden) project.href = projectURL.href;
        else project.removeAttribute('href');
      }
      if (previous) previous.disabled = links.length < 2;
      if (next) next.disabled = links.length < 2;
    };
    if (image) {
      image.addEventListener('load', () => dialog.classList.remove('is-loading'));
      image.addEventListener('error', () => {
        dialog.classList.remove('is-loading');
        dialog.classList.add('has-image-error');
        if (title) title.textContent = 'تعذر تحميل الصورة. يمكنك فتح المشروع أو المحاولة مجددًا.';
      });
    }
    selectAll('[data-lightbox]').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0 || !image || !safeURL(link.href)) return;
        event.preventDefault();
        const gallery = link.closest('[data-gallery]') || document;
        links = selectAll('[data-lightbox]', gallery).filter((candidate) => {
          const item = candidate.closest('[data-gallery-item]');
          return (!item || !item.hidden) && !!safeURL(candidate.href);
        });
        index = links.indexOf(link);
        if (index < 0) return;
        trigger = link;
        scrollLockedBefore = document.documentElement.classList.contains('dialog-open');
        navigate(index);
        dialog.showModal();
        document.documentElement.classList.add('dialog-open');
        if (close) close.focus();
      });
    });
    if (previous) previous.addEventListener('click', () => navigate(index - 1));
    if (next) next.addEventListener('click', () => navigate(index + 1));
    if (close) close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      if (!scrollLockedBefore) document.documentElement.classList.remove('dialog-open');
      if (trigger && trigger.isConnected && !trigger.closest('[hidden]')) trigger.focus();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const direction = (rtl && event.key === 'ArrowLeft') || (!rtl && event.key === 'ArrowRight') ? 1 : -1;
      navigate(index + direction);
    });
    swipe(dialog, () => navigate(index - 1), () => navigate(index + 1));
  }

  /* A real range input supports keyboard, touch and assistive technologies. */
  selectAll('[data-compare]').forEach((comparison) => {
    const range = select('[data-compare-range]', comparison);
    const label = select('[data-compare-label]', comparison);
    if (!range) return;
    const update = () => {
      const value = clamp(Number(range.value) || 0, 0, 100);
      comparison.style.setProperty('--compare', value + '%');
      range.setAttribute('aria-valuetext', 'عرض ' + arabicNumber.format(value) + ' بالمئة من الصورة قبل التنفيذ');
      if (label) label.textContent = arabicNumber.format(value) + '٪';
    };
    range.addEventListener('input', update);
    range.addEventListener('change', update);
    update();
  });

  /* Content remains visible if observers or motion preferences prohibit animation. */
  const reveals = selectAll('[data-reveal]');
  if (motion.matches || !('IntersectionObserver' in window)) {
    reveals.forEach((element) => element.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08 });
    reveals.forEach((element) => revealObserver.observe(element));
    listenMotion(() => {
      if (motion.matches) {
        reveals.forEach((element) => element.classList.add('is-visible'));
        revealObserver.disconnect();
      }
    });
  }

  const counters = selectAll('[data-counter]');
  const runCounter = (element) => {
    const target = Number(element.dataset.target);
    if (!Number.isFinite(target) || target < 0) return;
    const render = (value) => {
      element.textContent = (element.dataset.prefix || '') + arabicNumber.format(value) + (element.dataset.suffix || '');
    };
    if (motion.matches || target === 0) { render(target); return; }
    const started = performance.now();
    const tick = (now) => {
      const progress = clamp((now - started) / 1100, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      render(Number.isInteger(target) ? Math.round(target * eased) : Math.round(target * eased * 10) / 10);
      if (progress < 1 && !motion.matches) window.requestAnimationFrame(tick);
      else render(target);
    };
    window.requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window && !motion.matches) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        runCounter(entry.target);
        counterObserver.unobserve(entry.target);
      });
    }, { threshold: 0.35 });
    counters.forEach((element) => counterObserver.observe(element));
  } else counters.forEach(runCounter);

  /* Client checks complement server validation; no API credentials are shipped. */
  const normalizePhone = (value) => String(value)
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[^\d+]/g, '');
  selectAll('[data-phone]').forEach((input) => {
    const validate = () => {
      input.value = normalizePhone(input.value);
      const valid = !input.value || /^05\d{8}$/.test(input.value) || /^9665\d{8}$/.test(input.value) || /^\+[1-9]\d{7,14}$/.test(input.value);
      input.setCustomValidity(valid ? '' : 'أدخل رقم جوال صحيحًا، مثل 0501308295 أو +966501308295.');
    };
    input.addEventListener('input', validate);
    input.addEventListener('blur', validate);
    validate();
  });

  selectAll('[data-photo-input]').forEach((input) => {
    const form = input.form;
    const list = form ? select('[data-file-list]', form) : null;
    const maxCount = Number(input.dataset.maxFiles) || 6;
    const maxBytes = Number(input.dataset.maxBytes) || 5 * 1024 * 1024;
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      let error = '';
      if (files.length > maxCount) error = 'يمكن إرفاق ' + arabicNumber.format(maxCount) + ' صور كحد أقصى.';
      else if (files.some((file) => !allowedTypes.has(file.type))) error = 'اختر صورًا بصيغة JPEG أو PNG أو WebP أو AVIF.';
      else if (files.some((file) => file.size > maxBytes)) error = 'حجم كل صورة يجب ألا يتجاوز ' + arabicNumber.format(Math.round(maxBytes / 1024 / 1024)) + ' ميجابايت.';
      input.setCustomValidity(error);
      if (list) {
        list.replaceChildren();
        if (error) list.textContent = error;
        else files.forEach((file) => {
          const entry = document.createElement('span');
          entry.className = 'file-name';
          entry.textContent = file.name;
          list.append(entry);
        });
      }
      if (error) input.reportValidity();
    });
  });

  const submittedForms = new WeakSet();
  const publicForms = selectAll('[data-quote-form], [data-contact-form]');
  publicForms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (submittedForms.has(form)) { event.preventDefault(); return; }
      if (!form.checkValidity()) { event.preventDefault(); form.reportValidity(); return; }
      submittedForms.add(form);
      form.setAttribute('aria-busy', 'true');
      selectAll('[data-submit]', form).forEach((button) => {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = 'جارٍ إرسال الطلب…';
      });
    });

    const whatsapp = select('[data-quote-whatsapp]', form);
    if (!whatsapp) return;
    whatsapp.addEventListener('click', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const field = (names) => {
        for (const name of names) {
          const control = form.elements.namedItem(name);
          if (!control || !control.value) continue;
          if (control.tagName === 'SELECT') return control.selectedOptions[0]?.textContent.trim() || control.value;
          return String(control.value).trim();
        }
        return '';
      };
      const rows = [
        ['الاسم', ['name', 'fullName']],
        ['رقم الهاتف', ['phone']],
        ['رقم واتساب', ['whatsapp', 'whatsappPhone']],
        ['المنطقة', ['area', 'region']],
        ['الحي', ['neighborhood', 'district']],
        ['نوع الخدمة', ['service', 'serviceId']],
        ['نوع العقار', ['propertyType', 'property_type']],
        ['وصف العمل', ['description', 'message']],
        ['الميزانية التقريبية', ['budget']]
      ];
      const details = rows.map(([label, names]) => {
        const value = field(names);
        return value ? label + ': ' + value : '';
      }).filter(Boolean);
      const photos = select('[data-photo-input]', form);
      if (photos?.files?.length) details.push('الصور: ' + arabicNumber.format(photos.files.length) + ' صورة سأرفقها مباشرة في المحادثة.');
      const message = 'السلام عليكم، شاهدت موقع لمسة المستقبل وأرغب في معرفة التفاصيل والحصول على عرض سعر.\n\n' + details.join('\n');
      const number = String(whatsapp.dataset.whatsapp || form.dataset.whatsappNumber || '966501308295').replace(/\D/g, '');
      if (!/^[1-9]\d{7,14}$/.test(number)) return;
      window.open('https://wa.me/' + number + '?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
    });
  });

  window.addEventListener('pageshow', () => {
    publicForms.forEach((form) => {
      submittedForms.delete(form);
      form.removeAttribute('aria-busy');
      selectAll('[data-submit]', form).forEach((button) => {
        button.disabled = false;
        if (button.dataset.originalText) {
          button.textContent = button.dataset.originalText;
          delete button.dataset.originalText;
        }
      });
    });
  });
})();
