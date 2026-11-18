/* LearnHub front-end.
 * Plain JavaScript, no build step. Course videos come from static/data/courses.json;
 * progress, saved courses, notes and theme are kept in localStorage. */
(function () {
  "use strict";

  var body = document.body;
  var LEVELS = { Beginner: 1, Intermediate: 2, Advanced: 3 };

  /* ---------------- Storage (never throws) ---------------- */
  var KEY = "learnhub:v1";
  function readState() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "{}");
      return { progress: s.progress || {}, saved: s.saved || [], notes: s.notes || {}, email: s.email || "" };
    } catch (e) {
      return { progress: {}, saved: [], notes: {}, email: "" };
    }
  }
  var state = readState();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }
  function courseProgress(id) {
    var p = state.progress[id];
    if (!p) { p = state.progress[id] = { completed: [], last: null, updated: 0 }; }
    return p;
  }

  /* ---------------- Small helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "class") node.className = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }
  function icon(name, cls) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }
  function fmtSeconds(s) {
    var m = Math.round(s / 60), h = Math.floor(m / 60);
    m = m % 60;
    return h ? h + "h " + m + "m" : m + "m";
  }
  function courseUrl(id, lessonId) {
    var url = (body.dataset.courseUrl || "/course/0").replace(/0$/, String(id));
    return lessonId ? url + "?lesson=" + encodeURIComponent(lessonId) : url;
  }
  function shortSource(course) {
    var parts = course.source.split(",");
    return parts[0].trim() + (parts.length > 1 ? " and others" : "");
  }
  function thumbUrl(youtubeId) { return "https://i.ytimg.com/vi/" + youtubeId + "/hqdefault.jpg"; }
  function thumbImg(youtubeId) {
    return el("img", { src: thumbUrl(youtubeId), alt: "", loading: "lazy", decoding: "async", width: "480", height: "360" });
  }

  /* ---------------- Course data ---------------- */
  var coursesPromise = null;
  function loadCourses() {
    if (!coursesPromise) {
      coursesPromise = fetch(body.dataset.coursesUrl)
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (data) {
          var byId = {};
          data.courses.forEach(function (c) {
            c.lessons = [];
            c.seconds = 0;
            c.modules.forEach(function (m) {
              m.lessons.forEach(function (l) {
                l.module = m.title;
                l.index = c.lessons.length;
                c.lessons.push(l);
                c.seconds += l.seconds || 0;
              });
            });
            byId[c.id] = c;
          });
          return { list: data.courses, byId: byId };
        })
        .catch(function (err) {
          if (window.console) console.warn("LearnHub: could not load course data.", err);
          return { list: [], byId: {} };
        });
    }
    return coursesPromise;
  }
  function stats(course) {
    var p = state.progress[course.id];
    var done = p ? p.completed.filter(function (id) { return course.lessons.some(function (l) { return l.id === id; }); }).length : 0;
    var total = course.lessons.length;
    return { done: done, total: total, pct: total ? Math.round((done / total) * 100) : 0 };
  }
  function resumeLesson(course) {
    var p = state.progress[course.id];
    if (p && p.last && course.lessons.some(function (l) { return l.id === p.last; })) return p.last;
    var next = course.lessons.find(function (l) { return !(p && p.completed.indexOf(l.id) > -1); });
    return (next || course.lessons[0]).id;
  }
  function progressBar(pct, label) {
    return el("div", { class: "progress", role: "progressbar", "aria-label": label || "Progress",
      "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) },
      [el("span", { style: "width:" + pct + "%" })]);
  }

  /* ---------------- Theme ---------------- */
  function initTheme() {
    var btn = $("[data-theme-toggle]");
    if (!btn) return;
    function sync() {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      btn.innerHTML = "";
      btn.appendChild(icon(dark ? "sun" : "moon"));
    }
    btn.addEventListener("click", function () {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      if (dark) document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", "dark");
      try { localStorage.setItem("learnhub:theme", dark ? "light" : "dark"); } catch (e) {}
      sync();
    });
    sync();
  }

  /* ---------------- Mobile menu ---------------- */
  function initMenu() {
    var btn = $(".menu-toggle"), menu = $("#mobile-menu");
    if (!btn || !menu) return;
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      btn.setAttribute("aria-label", open ? "Open menu" : "Close menu");
      menu.hidden = open;
      btn.innerHTML = "";
      btn.appendChild(icon(open ? "menu" : "close"));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) { btn.click(); btn.focus(); }
    });
  }

  /* ---------------- Save for later ---------------- */
  function isSaved(id) { return state.saved.indexOf(Number(id)) > -1; }
  function syncSaveButton(btn) {
    var on = isSaved(btn.dataset.save);
    btn.setAttribute("aria-pressed", String(on));
    var label = $("span", btn);
    if (label) label.textContent = on ? "Saved" : "Save";
  }
  function initSaveButtons(root) {
    $all("[data-save]", root).forEach(function (btn) {
      syncSaveButton(btn);
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var id = Number(btn.dataset.save);
        if (isSaved(id)) state.saved = state.saved.filter(function (x) { return x !== id; });
        else state.saved.push(id);
        save();
        $all('[data-save="' + id + '"]').forEach(syncSaveButton);
      });
    });
  }

  /* ---------------- Learning list item (home + My Learning) ---------------- */
  function learningItem(course, opts) {
    var s = stats(course);
    var href = courseUrl(course.id, resumeLesson(course));
    var info = el("div", null, [
      el("h3", null, [el("a", { href: courseUrl(course.id), text: course.title })]),
      el("p", { class: "small muted", text: shortSource(course) + " · " + course.level }),
      opts && opts.progress ? progressBar(s.pct, "Progress in " + course.title) : null,
      opts && opts.progress ? el("span", { class: "progress-label", text: s.done + " of " + s.total + " lessons complete" }) : null
    ]);
    var actions = el("div", { class: "actions" }, [
      el("a", { class: "btn btn-primary btn-sm", href: href, text: s.done || (state.progress[course.id] && state.progress[course.id].last) ? "Continue" : "Start" })
    ]);
    if (opts && opts.removable) {
      var rm = el("button", { type: "button", class: "btn btn-ghost btn-sm", text: "Remove" });
      rm.addEventListener("click", function () {
        state.saved = state.saved.filter(function (x) { return x !== course.id; });
        save();
        opts.onChange && opts.onChange();
      });
      actions.appendChild(rm);
    }
    return el("li", { class: "learning-item" }, [
      el("div", { class: "thumb", "aria-hidden": "true" }, [thumbImg(course.lessons[0].youtubeId)]),
      info, actions
    ]);
  }
  function startedCourses(data) {
    return data.list
      .filter(function (c) { var p = state.progress[c.id]; return p && (p.last || p.completed.length); })
      .sort(function (a, b) { return (state.progress[b.id].updated || 0) - (state.progress[a.id].updated || 0); });
  }

  /* ---------------- Home / catalog ---------------- */
  function initHome(data) {
    var grid = $("[data-course-grid]");
    if (!grid) return;
    var cards = $all("[data-course-card]", grid);

    cards.forEach(function (card) {
      var c = data.byId[card.dataset.id];
      card.dataset.category = c ? c.category : "";
      card.dataset.seconds = c ? c.seconds : 0;
      card.dataset.source = c ? c.source : "";
      if (!c) return;
      var thumb = $("[data-thumb]", card);
      thumb.appendChild(thumbImg(c.lessons[0].youtubeId));
      thumb.appendChild(el("span", { class: "thumb-dur", text: c.lessons.length + " lessons · " + fmtSeconds(c.seconds) }));
      $("[data-source]", card).textContent = shortSource(c);
      var s = stats(c);
      if (s.done) {
        var foot = $(".course-card-foot", card);
        foot.appendChild(el("span", { class: "progress-label", text: s.pct + "% complete" }));
      }
    });

    // Continue learning row
    var started = startedCourses(data).slice(0, 3);
    if (started.length) {
      var list = $("[data-continue-list]");
      started.forEach(function (c) { list.appendChild(learningItem(c, { progress: true })); });
      $("[data-continue]").hidden = false;
    }

    // Filters
    var tools = $("[data-catalog-tools]");
    tools.hidden = false;
    var q = $("[data-filter-q]"), cat = $("[data-filter-category]"), lvl = $("[data-filter-level]"), sort = $("[data-sort]");
    var count = $("[data-result-count]"), empty = $("[data-empty]");
    var params = new URLSearchParams(location.search);
    if (params.get("q")) { q.value = params.get("q"); var hq = $("#hero-q"); if (hq) hq.value = params.get("q"); }
    if (params.get("category")) cat.value = params.get("category");
    if (params.get("level")) lvl.value = params.get("level");

    function apply() {
      var term = q.value.trim().toLowerCase();
      var visible = cards.filter(function (card) {
        var hay = [card.dataset.title, card.dataset.desc, card.dataset.instructor, card.dataset.category, card.dataset.source].join(" ").toLowerCase();
        var ok = (!term || term.split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; })) &&
          (!cat.value || card.dataset.category === cat.value) &&
          (!lvl.value || card.dataset.level === lvl.value);
        card.hidden = !ok;
        return ok;
      });
      var sorted = cards.slice().sort(function (a, b) {
        switch (sort.value) {
          case "title": return a.dataset.title.localeCompare(b.dataset.title);
          case "level": return (LEVELS[a.dataset.level] || 9) - (LEVELS[b.dataset.level] || 9) || a.dataset.order - b.dataset.order;
          case "shortest": return a.dataset.seconds - b.dataset.seconds;
          default: return a.dataset.order - b.dataset.order;
        }
      });
      sorted.forEach(function (card) { grid.appendChild(card); });
      count.textContent = visible.length === cards.length ? cards.length + " courses" : visible.length + " of " + cards.length + " courses";
      empty.hidden = visible.length > 0;
      $all("[data-topic-chips] [data-category]").forEach(function (chip) {
        chip.setAttribute("aria-pressed", String(chip.dataset.category === cat.value));
      });
      // Keep the URL shareable without reloading.
      var p = new URLSearchParams();
      if (q.value.trim()) p.set("q", q.value.trim());
      if (cat.value) p.set("category", cat.value);
      if (lvl.value) p.set("level", lvl.value);
      var qs = p.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }
    [q].forEach(function (i) { i.addEventListener("input", apply); });
    [cat, lvl, sort].forEach(function (s) { s.addEventListener("change", apply); });

    $all("[data-topic-chips] [data-category]").forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        cat.value = cat.value === chip.dataset.category ? "" : chip.dataset.category;
        apply();
        $("#catalog").scrollIntoView({ block: "start" });
      });
    });
    $("[data-clear-filters]").addEventListener("click", function () {
      q.value = ""; cat.value = ""; lvl.value = ""; apply(); q.focus();
    });
    var heroForm = $("[data-hero-search]");
    if (heroForm) heroForm.addEventListener("submit", function (e) {
      e.preventDefault();
      q.value = $("#hero-q").value;
      apply();
      $("#catalog").scrollIntoView({ block: "start" });
    });

    apply();
    if (params.get("q") || params.get("category") || params.get("level")) {
      $("#catalog").scrollIntoView({ block: "start" });
    }
  }

  /* ---------------- Course overview ---------------- */
  function initOverview(course) {
    var root = $("[data-overview]");
    $("[data-category]", root).textContent = course.category;
    $("[data-thumb]", root).appendChild(thumbImg(course.lessons[0].youtubeId));
    $("[data-video-total]", root).textContent = fmtSeconds(course.seconds);
    $("[data-lesson-count]", root).textContent = String(course.lessons.length);

    var learn = $("[data-learn]", root);
    course.learn.forEach(function (item) {
      learn.appendChild(el("li", null, [icon("check"), el("span", { text: item })]));
    });
    $("[data-learn-section]", root).hidden = false;

    var p = state.progress[course.id];
    var syl = $("[data-syllabus]", root);
    course.modules.forEach(function (m, i) {
      var secs = m.lessons.reduce(function (a, l) { return a + l.seconds; }, 0);
      var rows = el("ol", { class: "lesson-rows" });
      m.lessons.forEach(function (l) {
        var done = p && p.completed.indexOf(l.id) > -1;
        rows.appendChild(el("li", { class: done ? "done" : "" }, [
          el("a", { href: courseUrl(course.id, l.id) }, [
            icon(done ? "check-circle" : "play-circle"),
            el("span", null, [l.title, done ? el("span", { class: "sr-only", text: " (completed)" }) : null]),
            el("span", { class: "dur", text: l.duration })
          ])
        ]));
      });
      syl.appendChild(el("details", i === 0 ? { open: "" } : null, [
        el("summary", null, [
          el("span", null, [
            el("span", { class: "mod-title", text: "Module " + (i + 1) + ": " + m.title }),
            el("br"),
            el("span", { class: "mod-meta", text: m.lessons.length + (m.lessons.length === 1 ? " lesson" : " lessons") + " · " + fmtSeconds(secs) })
          ]),
          el("span"),
          icon("chevron-down", "chev")
        ]),
        rows
      ]));
    });
    $("[data-syllabus-section]", root).hidden = false;

    var credits = {};
    course.lessons.forEach(function (l) { (credits[l.channel] = credits[l.channel] || []).push(l); });
    var cl = $("[data-credits-list]", root);
    Object.keys(credits).forEach(function (ch) {
      cl.appendChild(el("li", { text: ch + " (" + credits[ch].length + (credits[ch].length === 1 ? " lecture)" : " lectures)") }));
    });
    $("[data-credits]", root).hidden = false;

    var start = $("[data-start]", root);
    var s = stats(course);
    start.href = courseUrl(course.id, resumeLesson(course));
    start.textContent = s.done || (p && p.last) ? "Continue (" + s.pct + "%)" : "Start course";
    start.hidden = false;
  }

  /* ---------------- Player ---------------- */
  function initPlayer(course, lessonId) {
    var lesson = course.lessons.find(function (l) { return l.id === lessonId; });
    if (!lesson) return false;
    var root = $("[data-player]");
    var prog = courseProgress(course.id);
    prog.last = lesson.id;
    prog.updated = Date.now();
    save();

    document.title = lesson.title + " – " + course.title + " – LearnHub";
    var crumb = $("[data-crumb-lesson]");
    if (crumb) crumb.textContent = lesson.title;

    // Click-to-load video facade
    var video = $("[data-video]", root);
    var facade = el("button", { type: "button", class: "video-facade", "aria-label": "Play video: " + lesson.title }, [
      thumbImg(lesson.youtubeId),
      el("span", { class: "play" }, [icon("play")]),
      el("span", { class: "facade-label", text: lesson.duration + " · " + lesson.channel })
    ]);
    $("img", facade).setAttribute("loading", "eager");
    facade.addEventListener("click", function () {
      var iframe = el("iframe", {
        src: "https://www.youtube-nocookie.com/embed/" + lesson.youtubeId + "?autoplay=1&rel=0&modestbranding=1",
        title: lesson.title + " (" + lesson.channel + ")",
        allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
        allowfullscreen: "",
        referrerpolicy: "strict-origin-when-cross-origin"
      });
      video.innerHTML = "";
      video.appendChild(iframe);
      iframe.focus();
    });
    video.appendChild(facade);

    // Lesson info + source credit
    $("[data-lesson-module]", root).textContent = "Lesson " + (lesson.index + 1) + " of " + course.lessons.length + " · " + lesson.module;
    $("[data-lesson-title]", root).textContent = lesson.title;
    var src = $("[data-lesson-source]", root);
    src.appendChild(document.createTextNode("Lecture: "));
    src.appendChild(el("a", { href: lesson.sourceUrl, target: "_blank", rel: "noopener" }, [lesson.sourceTitle]));
    src.appendChild(document.createTextNode(" by " + lesson.channel + " on YouTube · " + lesson.duration));

    // Prev / next
    var prev = course.lessons[lesson.index - 1], next = course.lessons[lesson.index + 1];
    var prevBtn = $("[data-prev]", root), nextBtn = $("[data-next]", root);
    if (prev) { prevBtn.href = courseUrl(course.id, prev.id); prevBtn.title = prev.title; }
    else { prevBtn.setAttribute("aria-disabled", "true"); prevBtn.removeAttribute("href"); }
    if (next) { nextBtn.href = courseUrl(course.id, next.id); nextBtn.title = next.title; }
    else {
      nextBtn.href = courseUrl(course.id);
      nextBtn.textContent = "Finish";
    }

    // Lesson list
    var list = $("[data-panel-list]", root);
    function renderPanel() {
      list.innerHTML = "";
      course.modules.forEach(function (m) {
        list.appendChild(el("li", { class: "panel-mod", "aria-hidden": "true", text: m.title }));
        m.lessons.forEach(function (l) {
          var done = prog.completed.indexOf(l.id) > -1;
          list.appendChild(el("li", { class: done ? "done" : "" }, [
            el("a", { href: courseUrl(course.id, l.id), "aria-current": l.id === lesson.id ? "true" : null }, [
              icon(done ? "check-circle" : (l.id === lesson.id ? "play-circle" : "circle")),
              el("span", null, [
                l.title,
                done ? el("span", { class: "sr-only", text: " (completed)" }) : null,
                el("span", { class: "dur", text: l.duration })
              ])
            ])
          ]));
        });
      });
      var s = stats(course);
      var bar = $("[data-progress]", root);
      bar.setAttribute("aria-valuenow", String(s.pct));
      bar.firstElementChild.style.width = s.pct + "%";
      $("[data-progress-label]", root).textContent = s.done + " of " + s.total + " complete";
    }
    renderPanel();
    var current = $('[aria-current="true"]', list);
    if (current && window.matchMedia("(min-width: 1000px)").matches) {
      current.scrollIntoView({ block: "nearest" });
      window.scrollTo(0, 0);
    }

    // Mark complete
    var box = $("[data-complete]", root);
    box.checked = prog.completed.indexOf(lesson.id) > -1;
    box.addEventListener("change", function () {
      prog.completed = prog.completed.filter(function (id) { return id !== lesson.id; });
      if (box.checked) prog.completed.push(lesson.id);
      prog.updated = Date.now();
      save();
      renderPanel();
    });

    // Notes (autosave)
    var noteKey = course.id + ":" + lesson.id;
    var notes = $("[data-notes]", root), status = $("[data-notes-status]", root), timer = null;
    notes.value = state.notes[noteKey] || "";
    if (notes.value) status.textContent = "Saved";
    notes.addEventListener("input", function () {
      status.textContent = "Saving…";
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (notes.value.trim()) state.notes[noteKey] = notes.value;
        else delete state.notes[noteKey];
        save();
        status.textContent = "Saved";
      }, 500);
    });

    $("[data-overview]").hidden = true;
    root.hidden = false;
    return true;
  }

  function initCoursePage(data) {
    var page = $("[data-course-page]");
    if (!page) return;
    var course = data.byId[page.dataset.courseId];
    if (!course) return; // no video data for this course: the server-rendered overview stays as is
    var lessonId = new URLSearchParams(location.search).get("lesson");
    if (lessonId && initPlayer(course, lessonId)) return;
    initOverview(course);
  }

  /* ---------------- My Learning ---------------- */
  function initMyLearning(data) {
    if (body.dataset.page !== "my_enrollments") return;

    function render() {
      var started = startedCourses(data);
      var inList = $("[data-in-progress-list]");
      inList.innerHTML = "";
      started.forEach(function (c) { inList.appendChild(learningItem(c, { progress: true })); });
      $("[data-in-progress]").hidden = !started.length;

      var saved = state.saved.map(function (id) { return data.byId[id]; }).filter(Boolean);
      var sList = $("[data-saved-list]");
      sList.innerHTML = "";
      saved.forEach(function (c) { sList.appendChild(learningItem(c, { removable: true, onChange: render })); });
      $("[data-saved]").hidden = !saved.length;
    }
    render();

    // Enrollment rows: link to the course and show local progress.
    $all("[data-enrollment]").forEach(function (row) {
      var c = data.list.find(function (x) { return x.title === row.dataset.courseTitle; });
      var cell = $("[data-enrollment-action]", row);
      if (!c || !cell) return;
      var s = stats(c);
      cell.appendChild(el("a", { class: "btn btn-outline btn-sm", href: courseUrl(c.id, resumeLesson(c)),
        text: s.done ? "Continue (" + s.pct + "%)" : "Start" }));
    });

    // Remember the last email that returned enrollments, and prefill it next time.
    var input = $("#email");
    var params = new URLSearchParams(location.search);
    if (params.get("email") && $("[data-enrollment]")) { state.email = params.get("email"); save(); }
    else if (input && !input.value && state.email) { input.value = state.email; }
  }

  /* ---------------- Boot ---------------- */
  initTheme();
  initMenu();
  initSaveButtons(document);
  loadCourses().then(function (data) {
    initHome(data);
    initCoursePage(data);
    initMyLearning(data);
    initSaveButtons(document);
  });
})();
