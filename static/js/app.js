/* LearnHub front-end.
 * Plain JavaScript, no build step. Lessons, quizzes, paths and credits come from
 * static/data/courses.json (matched to database courses by title, then id).
 * Progress, quiz results, saved courses, notes and theme are kept in localStorage. */
(function () {
  "use strict";

  var body = document.body;
  var LEVELS = { Beginner: 1, Intermediate: 2, Advanced: 3 };
  var CATEGORY_LABELS = {
    "Cloud": "Cloud computing", "DevOps": "DevOps", "Computer Science": "Computer science",
    "Programming": "Programming & web", "Data": "Data & machine learning", "Systems": "Systems & networking",
    "Security": "Security", "Math": "Mathematics"
  };
  var LENGTHS = [
    { id: "short", label: "Under 8 hours", test: function (s) { return s < 8 * 3600; } },
    { id: "medium", label: "8 to 15 hours", test: function (s) { return s >= 8 * 3600 && s <= 15 * 3600; } },
    { id: "long", label: "More than 15 hours", test: function (s) { return s > 15 * 3600; } }
  ];
  var PASS_MARK = 0.7;

  /* ---------------- Storage (never throws) ---------------- */
  var KEY = "learnhub:v1";
  function readState() {
    var empty = { progress: {}, saved: [], notes: {}, quiz: {}, email: "" };
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "{}");
      return { progress: s.progress || {}, saved: s.saved || [], notes: s.notes || {}, quiz: s.quiz || {}, email: s.email || "" };
    } catch (e) { return empty; }
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
  function isDone(course, itemId) {
    var p = state.progress[course.id];
    return !!(p && p.completed.indexOf(itemId) > -1);
  }

  /* ---------------- Small helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") node.textContent = v;
      else if (k === "class") node.className = v;
      else node.setAttribute(k, v);
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
    var m = Math.max(1, Math.round(s / 60)), h = Math.floor(m / 60);
    m = m % 60;
    return h ? h + "h " + m + "m" : m + "m";
  }
  function fmtClock(s) {
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(x).padStart(2, "0");
  }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  function courseUrl(course, itemId) {
    var url = (body.dataset.courseUrl || "/course/0").replace(/0$/, String(course.dbId || course.id));
    return itemId ? url + "?lesson=" + encodeURIComponent(itemId) : url;
  }
  function homeUrl(query) { return (body.dataset.homeUrl || "/") + (query ? "?" + query : "") + "#catalog"; }
  function thumbUrl(youtubeId) { return "https://i.ytimg.com/vi/" + youtubeId + "/hqdefault.jpg"; }
  function thumbImg(youtubeId) {
    return el("img", { src: thumbUrl(youtubeId), alt: "", loading: "lazy", decoding: "async", width: "480", height: "360" });
  }
  function shortSource(course) {
    var parts = course.channels || course.source.split(", ");
    return parts[0] + (parts.length > 1 ? " and others" : "");
  }

  /* ---------------- Course data ---------------- */
  var dataPromise = null;
  function loadData() {
    if (!dataPromise) {
      dataPromise = fetch(body.dataset.coursesUrl)
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(prepare)
        .catch(function (err) {
          if (window.console) console.warn("LearnHub: could not load course data.", err);
          return { list: [], byId: {}, byTitle: {}, paths: [], channels: {}, faq: [] };
        });
    }
    return dataPromise;
  }
  function prepare(data) {
    var byId = {}, byTitle = {};
    data.courses.forEach(function (c) {
      c.items = [];
      c.lessonCount = 0;
      c.quizCount = 0;
      c.modules.forEach(function (m, mi) {
        m.index = mi;
        m.seconds = 0;
        m.lessons.forEach(function (l) {
          l.kind = "lesson";
          l.module = m;
          l.index = c.items.length;
          m.seconds += l.seconds;
          c.items.push(l);
          c.lessonCount++;
        });
        if (m.quiz && m.quiz.length) {
          m.quizItem = { kind: "quiz", id: "m" + (mi + 1) + "-quiz", title: "Module " + (mi + 1) + " quiz", module: m, index: c.items.length, questions: m.quiz };
          c.items.push(m.quizItem);
          c.quizCount++;
        }
      });
      c.cover = c.modules[0].lessons[0].youtubeId;
      byId[c.id] = c;
      byTitle[c.title] = c;
    });
    (data.paths || []).forEach(function (p) {
      p.list = p.courses.map(function (t) { return byTitle[t]; }).filter(Boolean);
      p.seconds = p.list.reduce(function (a, c) { return a + c.seconds; }, 0);
    });
    return { list: data.courses, byId: byId, byTitle: byTitle, paths: data.paths || [], channels: data.channels || {}, faq: data.faq || [] };
  }
  function findCourse(data, id, title) {
    var c = (title && data.byTitle[title]) || null;
    if (!c && !title) c = data.byId[id] || null;
    if (c && id) c.dbId = Number(id);
    return c;
  }
  // Database ids for cards/links: the page tells us the real id, so record it.
  function linkCoursesToCards(data) {
    $all("[data-course-card]").forEach(function (card) {
      var c = data.byTitle[card.dataset.title];
      if (c) c.dbId = Number(card.dataset.id);
    });
  }
  function stats(course) {
    var done = course.items.filter(function (it) { return isDone(course, it.id); }).length;
    var total = course.items.length;
    return { done: done, total: total, pct: total ? Math.round((done / total) * 100) : 0 };
  }
  function resumeItem(course) {
    var p = state.progress[course.id];
    if (p && p.last && course.items.some(function (it) { return it.id === p.last; })) return p.last;
    var next = course.items.find(function (it) { return !isDone(course, it.id); });
    return (next || course.items[0]).id;
  }
  function hasStarted(course) {
    var p = state.progress[course.id];
    return !!(p && (p.last || p.completed.length));
  }
  function progressBar(pct, label) {
    return el("div", { class: "progress", role: "progressbar", "aria-label": label || "Progress",
      "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) },
      [el("span", { style: "width:" + pct + "%" })]);
  }
  function pathsFor(data, course) {
    return data.paths.filter(function (p) { return p.list.indexOf(course) > -1; });
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

  /* ---------------- Header menus ---------------- */
  function initMenus() {
    var btn = $(".menu-toggle"), menu = $("#mobile-menu");
    if (btn && menu) {
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        btn.setAttribute("aria-label", open ? "Open menu" : "Close menu");
        menu.hidden = open;
        btn.innerHTML = "";
        btn.appendChild(icon(open ? "menu" : "close"));
      });
    }
    var explore = $("[data-explore]");
    document.addEventListener("click", function (e) {
      if (explore && explore.open && !explore.contains(e.target)) explore.open = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (explore && explore.open) { explore.open = false; $("summary", explore).focus(); }
      if (menu && !menu.hidden) { btn.click(); btn.focus(); }
    });
    if (explore) $all("a", explore).forEach(function (a) { a.addEventListener("click", function () { explore.open = false; }); });
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

  /* ---------------- Shared pieces ---------------- */
  function learningItem(course, opts) {
    var s = stats(course);
    var info = el("div", null, [
      el("h3", null, [el("a", { href: courseUrl(course), text: course.title })]),
      el("p", { class: "small muted", text: shortSource(course) + " · " + course.level + " · " + plural(course.lessonCount, "lesson") }),
      opts && opts.progress ? progressBar(s.pct, "Progress in " + course.title) : null,
      opts && opts.progress ? el("span", { class: "progress-label", text: s.done + " of " + s.total + " items complete (" + s.pct + "%)" }) : null
    ]);
    var actions = el("div", { class: "actions" }, [
      el("a", { class: "btn btn-primary btn-sm", href: courseUrl(course, resumeItem(course)), text: hasStarted(course) ? "Continue" : "Start" })
    ]);
    if (opts && opts.removable) {
      var rm = el("button", { type: "button", class: "btn btn-ghost btn-sm", text: "Remove" });
      rm.addEventListener("click", function () {
        state.saved = state.saved.filter(function (x) { return x !== course.dbId && x !== course.id; });
        save();
        opts.onChange && opts.onChange();
      });
      actions.appendChild(rm);
    }
    return el("li", { class: "learning-item" }, [
      el("div", { class: "thumb", "aria-hidden": "true" }, [thumbImg(course.cover)]), info, actions
    ]);
  }
  function startedCourses(data) {
    return data.list.filter(hasStarted).sort(function (a, b) {
      return (state.progress[b.id].updated || 0) - (state.progress[a.id].updated || 0);
    });
  }
  function miniCard(course) {
    return el("li", { class: "course-card" }, [
      el("div", { class: "thumb", "aria-hidden": "true" }, [thumbImg(course.cover)]),
      el("div", { class: "course-card-body" }, [
        el("span", { class: "course-card-source", text: shortSource(course) }),
        el("h3", { class: "course-card-title" }, [el("a", { href: courseUrl(course), text: course.title })]),
        el("p", { class: "stats", text: course.level + " · " + plural(course.lessonCount, "lesson") + " · " + fmtSeconds(course.seconds) })
      ])
    ]);
  }

  /* ---------------- Home / catalog ---------------- */
  function initHome(data) {
    var grid = $("[data-course-grid]");
    if (!grid) return;
    var cards = $all("[data-course-card]", grid);
    linkCoursesToCards(data);

    // Site stats
    var lessons = data.list.reduce(function (a, c) { return a + c.lessonCount; }, 0);
    var quizzes = data.list.reduce(function (a, c) { return a + c.quizCount; }, 0);
    if ($("[data-stat-lessons]")) $("[data-stat-lessons]").textContent = lessons.toLocaleString();
    if ($("[data-stat-quizzes]")) $("[data-stat-quizzes]").textContent = String(quizzes);

    cards.forEach(function (card) {
      var c = data.byTitle[card.dataset.title];
      card.course = c || null;
      card.dataset.category = c ? c.category : "";
      card.dataset.seconds = c ? c.seconds : 0;
      card.dataset.lessons = c ? c.lessonCount : 0;
      card.dataset.search = [card.dataset.title, card.dataset.desc, card.dataset.instructor,
        c ? c.category + " " + c.source + " " + c.skills.join(" ") : ""].join(" ").toLowerCase();
      if (!c) return;
      var thumb = $("[data-thumb]", card);
      thumb.appendChild(thumbImg(c.cover));
      thumb.appendChild(el("span", { class: "thumb-dur", text: fmtSeconds(c.seconds) }));
      $("[data-source]", card).textContent = shortSource(c);
      $("[data-stats]", card).textContent = plural(c.lessonCount, "lesson") + " · " + plural(c.quizCount, "quiz").replace("quizs", "quizzes") + " · " + plural(c.modules.length, "module");
      var s = stats(c);
      if (s.done) $(".course-card-foot", card).appendChild(el("span", { class: "progress-label", text: s.pct + "% complete" }));
    });

    // Continue learning
    var started = startedCourses(data).slice(0, 3);
    if (started.length) {
      var list = $("[data-continue-list]");
      started.forEach(function (c) { list.appendChild(learningItem(c, { progress: true })); });
      $("[data-continue]").hidden = false;
    }

    // Learning paths
    var pathList = $("[data-paths]");
    if (pathList && data.paths.length) {
      data.paths.forEach(function (p) {
        var done = p.list.filter(function (c) { return stats(c).pct === 100; }).length;
        pathList.appendChild(el("li", { class: "path-card" }, [
          el("div", { class: "thumb-strip", "aria-hidden": "true" }, p.list.slice(0, 4).map(function (c) { return thumbImg(c.cover); })),
          el("h3", null, [el("a", { href: homeUrl("path=" + p.id), text: p.title })]),
          el("p", { text: p.description }),
          el("ol", null, p.list.map(function (c) { return el("li", { text: c.title }); })),
          el("div", { class: "meta" }, [
            el("span", { text: plural(p.list.length, "course") }),
            el("span", { text: fmtSeconds(p.seconds) + " of video" }),
            done ? el("span", { text: done + " completed" }) : null
          ])
        ]));
      });
      $("[data-paths-section]").hidden = false;
    }

    // Topic counts
    $all("[data-topic-count]").forEach(function (span) {
      var n = data.list.filter(function (c) { return c.category === span.dataset.topicCount; }).length;
      span.textContent = plural(n, "course");
    });

    // ---- Filters ----
    var filters = { category: [], level: [], length: [] };
    var q = $("[data-filter-q]"), sort = $("[data-sort]");
    var count = $("[data-result-count]"), empty = $("[data-empty]"), tags = $("[data-active-filters]"), banner = $("[data-path-banner]");
    var activePath = null;

    function addOption(group, value, label, n) {
      var input = el("input", { type: "checkbox", value: value });
      input.addEventListener("change", function () {
        var arr = filters[group];
        if (input.checked) arr.push(value); else filters[group] = arr.filter(function (v) { return v !== value; });
        apply();
      });
      $('[data-filter-group="' + group + '"]').appendChild(el("label", { class: "filter-option" }, [input, el("span", { text: label }), el("span", { class: "count", text: String(n) })]));
    }
    Object.keys(CATEGORY_LABELS).forEach(function (k) {
      var n = data.list.filter(function (c) { return c.category === k; }).length;
      if (n) addOption("category", k, CATEGORY_LABELS[k], n);
    });
    ["Beginner", "Intermediate", "Advanced"].forEach(function (lv) {
      addOption("level", lv, lv, cards.filter(function (c) { return c.dataset.level === lv; }).length);
    });
    LENGTHS.forEach(function (b) {
      addOption("length", b.id, b.label, data.list.filter(function (c) { return b.test(c.seconds); }).length);
    });
    function syncChecks() {
      Object.keys(filters).forEach(function (g) {
        $all('[data-filter-group="' + g + '"] input').forEach(function (i) { i.checked = filters[g].indexOf(i.value) > -1; });
      });
    }

    var params = new URLSearchParams(location.search);
    if (params.get("q")) { q.value = params.get("q"); if ($("#hero-q")) $("#hero-q").value = params.get("q"); }
    ["category", "level", "length"].forEach(function (g) {
      params.getAll(g).forEach(function (v) { v.split(",").forEach(function (x) { if (x) filters[g].push(x); }); });
    });
    if (params.get("path")) activePath = data.paths.find(function (p) { return p.id === params.get("path"); }) || null;
    syncChecks();

    function lengthMatch(card) {
      if (!filters.length.length) return true;
      return LENGTHS.some(function (b) { return filters.length.indexOf(b.id) > -1 && b.test(Number(card.dataset.seconds)); });
    }
    function apply() {
      var term = q.value.trim().toLowerCase();
      var visible = cards.filter(function (card) {
        var ok = (!term || term.split(/\s+/).every(function (w) { return card.dataset.search.indexOf(w) > -1; })) &&
          (!filters.category.length || filters.category.indexOf(card.dataset.category) > -1) &&
          (!filters.level.length || filters.level.indexOf(card.dataset.level) > -1) &&
          lengthMatch(card) &&
          (!activePath || activePath.list.indexOf(card.course) > -1);
        card.hidden = !ok;
        var step = $(".path-step", card);
        if (step) step.remove();
        if (ok && activePath) {
          $("[data-thumb]", card).appendChild(el("span", { class: "path-step", text: "Step " + (activePath.list.indexOf(card.course) + 1) }));
        }
        return ok;
      });
      var sorted = cards.slice().sort(function (a, b) {
        if (activePath && sort.value === "default") return activePath.list.indexOf(a.course) - activePath.list.indexOf(b.course);
        switch (sort.value) {
          case "title": return a.dataset.title.localeCompare(b.dataset.title);
          case "level": return (LEVELS[a.dataset.level] || 9) - (LEVELS[b.dataset.level] || 9) || a.dataset.order - b.dataset.order;
          case "shortest": return a.dataset.seconds - b.dataset.seconds;
          case "longest": return b.dataset.seconds - a.dataset.seconds;
          case "lessons": return b.dataset.lessons - a.dataset.lessons;
          default: return a.dataset.order - b.dataset.order;
        }
      });
      sorted.forEach(function (card) { grid.appendChild(card); });
      count.textContent = visible.length === cards.length ? plural(cards.length, "course") : visible.length + " of " + cards.length + " courses";
      empty.hidden = visible.length > 0;

      // Path banner
      banner.innerHTML = "";
      if (activePath) {
        var close = el("button", { type: "button", class: "btn btn-ghost btn-sm", text: "Show all courses" });
        close.addEventListener("click", function () { activePath = null; apply(); });
        banner.appendChild(el("div", { class: "path-banner" }, [
          el("p", { class: "eyebrow", text: "Learning path" }),
          el("h3", { text: activePath.title }),
          el("p", { text: activePath.description + " " + plural(activePath.list.length, "course") + ", " + fmtSeconds(activePath.seconds) + " of video, in the order shown." }),
          close
        ]));
      }

      // Active filter tags
      tags.innerHTML = "";
      Object.keys(filters).forEach(function (g) {
        filters[g].forEach(function (v) {
          var label = g === "category" ? CATEGORY_LABELS[v] : g === "length" ? (LENGTHS.find(function (b) { return b.id === v; }) || {}).label : v;
          var x = el("button", { type: "button", "aria-label": "Remove filter " + label }, [icon("close")]);
          x.addEventListener("click", function () { filters[g] = filters[g].filter(function (y) { return y !== v; }); syncChecks(); apply(); });
          tags.appendChild(el("span", { class: "filter-tag" }, [label, x]));
        });
      });
      $all("[data-topic-chips] [data-category]").forEach(function (chip) {
        chip.setAttribute("aria-pressed", String(filters.category.length === 1 && filters.category[0] === chip.dataset.category));
      });

      // Shareable URL
      var p = new URLSearchParams();
      if (q.value.trim()) p.set("q", q.value.trim());
      ["category", "level", "length"].forEach(function (g) { if (filters[g].length) p.set(g, filters[g].join(",")); });
      if (activePath) p.set("path", activePath.id);
      var qs = p.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }

    q.addEventListener("input", apply);
    sort.addEventListener("change", apply);
    $all("[data-topic-chips] [data-category]").forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        var k = chip.dataset.category;
        filters.category = filters.category.length === 1 && filters.category[0] === k ? [] : [k];
        activePath = null;
        syncChecks(); apply();
        $("#catalog").scrollIntoView({ block: "start" });
      });
    });
    $all(".path-card a").forEach(function (a, i) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        activePath = data.paths[i];
        apply();
        $("#catalog").scrollIntoView({ block: "start" });
      });
    });
    $all("[data-clear-filters]").forEach(function (b) {
      b.addEventListener("click", function () {
        q.value = ""; filters = { category: [], level: [], length: [] }; activePath = null; syncChecks(); apply(); q.focus();
      });
    });
    var heroForm = $("[data-hero-search]");
    if (heroForm) heroForm.addEventListener("submit", function (e) {
      e.preventDefault();
      q.value = $("#hero-q").value;
      apply();
      $("#catalog").scrollIntoView({ block: "start" });
    });
    // Header Explore links point at this same page: apply them without a reload.
    $all('.explore-panel a, .mobile-menu a').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var u = new URL(a.href, location.href);
        if (u.pathname !== location.pathname) return;
        e.preventDefault();
        filters = { category: u.searchParams.get("category") ? [u.searchParams.get("category")] : [], level: [], length: [] };
        activePath = data.paths.find(function (p) { return p.id === u.searchParams.get("path"); }) || null;
        q.value = "";
        syncChecks(); apply();
        $("#catalog").scrollIntoView({ block: "start" });
      });
    });

    $("[data-filters]").hidden = false;
    $("[data-catalog-tools]").hidden = false;
    if (window.matchMedia("(max-width: 999px)").matches) $("[data-filters]").open = false;
    apply();
    if (["q", "category", "level", "length", "path"].some(function (k) { return params.get(k); })) {
      $("#catalog").scrollIntoView({ block: "start" });
    }
  }

  /* ---------------- Course overview ---------------- */
  function initOverview(data, course) {
    var root = $("[data-overview]");
    $("[data-category]", root).textContent = CATEGORY_LABELS[course.category] || course.category;
    $("[data-thumb]", root).appendChild(thumbImg(course.cover));
    $("[data-video-total]", root).textContent = fmtSeconds(course.seconds);
    $("[data-lesson-count]", root).textContent = String(course.lessonCount);

    // Key facts
    var facts = $("[data-facts]", root);
    [["Modules", course.modules.length], ["Video lessons", course.lessonCount], ["Quizzes", course.quizCount],
     ["Video length", fmtSeconds(course.seconds)], ["Level", course.level]].forEach(function (f) {
      facts.appendChild(el("div", null, [el("dt", { text: f[0] }), el("dd", { text: String(f[1]) })]));
    });
    facts.hidden = false;

    // Skills and outcomes
    var skills = $("[data-skills]", root);
    course.skills.forEach(function (s) { skills.appendChild(el("li", { text: s })); });
    $("[data-skills-wrap]", root).hidden = false;
    var learn = $("[data-learn]", root);
    course.learn.forEach(function (item) { learn.appendChild(el("li", null, [icon("check"), el("span", { text: item })])); });
    $("[data-learn-section]", root).hidden = false;

    // Syllabus
    $("[data-syllabus-title]", root).textContent = "There " + (course.modules.length === 1 ? "is 1 module" : "are " + course.modules.length + " modules") + " in this course";
    $("[data-syllabus-summary]", root).textContent = plural(course.lessonCount, "video lesson") + ", " + plural(course.quizCount, "quiz").replace("quizs", "quizzes") + " · " + fmtSeconds(course.seconds) + " of video in total";
    var syl = $("[data-syllabus]", root);
    course.modules.forEach(function (m, i) {
      var rows = el("ol", { class: "lesson-rows" });
      m.lessons.forEach(function (l) {
        var done = isDone(course, l.id);
        rows.appendChild(el("li", { class: done ? "done" : "" }, [
          el("a", { href: courseUrl(course, l.id) }, [
            icon(done ? "check-circle" : "play-circle"),
            el("span", null, [l.title, done ? el("span", { class: "sr-only", text: " (completed)" }) : null]),
            el("span", { class: "dur", text: l.duration })
          ])
        ]));
      });
      if (m.quizItem) {
        var qd = isDone(course, m.quizItem.id);
        rows.appendChild(el("li", { class: "quiz-row" + (qd ? " done" : "") }, [
          el("a", { href: courseUrl(course, m.quizItem.id) }, [
            icon(qd ? "check-circle" : "quiz"),
            el("span", { text: "Module quiz" + (qd ? " (passed)" : "") }),
            el("span", { class: "dur", text: plural(m.quiz.length, "question") })
          ])
        ]));
      }
      syl.appendChild(el("details", i === 0 ? { open: "" } : null, [
        el("summary", null, [
          el("span", null, [
            el("span", { class: "mod-num", text: "Module " + (i + 1) }),
            el("span", { class: "mod-title", text: m.title }),
            el("br"),
            el("span", { class: "mod-meta", text: plural(m.lessons.length, "video") + (m.quizItem ? " · 1 quiz" : "") + " · " + fmtSeconds(m.seconds) })
          ]),
          el("span"),
          icon("chevron-down", "chev")
        ]),
        el("p", { class: "mod-desc", text: m.description }),
        rows
      ]));
    });
    var expand = $("[data-expand-all]", root);
    expand.addEventListener("click", function () {
      var all = $all("details", syl), openAll = all.some(function (d) { return !d.open; });
      all.forEach(function (d) { d.open = openAll; });
      expand.textContent = openAll ? "Collapse all modules" : "Expand all modules";
    });
    $("[data-syllabus-section]", root).hidden = false;

    // Instructors and channels
    var people = $("[data-instructors]", root);
    course.channels.forEach(function (ch) {
      var n = course.items.filter(function (it) { return it.kind === "lesson" && it.channel === ch; }).length;
      people.appendChild(el("div", { class: "person" }, [
        el("div", { class: "avatar", "aria-hidden": "true", text: ch.charAt(0) }),
        el("div", null, [
          el("h3", { text: ch }),
          el("p", { text: (data.channels[ch] || "YouTube channel.") + " " + plural(n, "lesson") + " in this course." })
        ])
      ]));
    });

    // FAQ
    if (data.faq.length) {
      var faq = $("[data-faq]", root);
      data.faq.forEach(function (f) {
        faq.appendChild(el("details", null, [el("summary", null, [el("span", { text: f.q }), icon("chevron-down")]), el("p", { text: f.a })]));
      });
      $("[data-faq-section]", root).hidden = false;
    }

    // Paths
    var paths = pathsFor(data, course), boxes = $("[data-path-boxes]", root);
    paths.forEach(function (p) {
      var pos = p.list.indexOf(course);
      boxes.appendChild(el("div", { class: "side-box path-box" }, [
        el("p", { class: "eyebrow", text: "Learning path" }),
        el("h3", null, [el("a", { href: homeUrl("path=" + p.id), text: p.title })]),
        el("p", { text: "Course " + (pos + 1) + " of " + p.list.length + "." }),
        el("ol", null, p.list.map(function (c) {
          return el("li", { class: c === course ? "current" : "" }, [c === course ? c.title : el("a", { href: courseUrl(c), text: c.title })]);
        }))
      ]));
    });
    if (paths.length) {
      var note = $("[data-path-note]", root);
      note.textContent = "Part of the " + paths.map(function (p) { return p.title; }).join(" and ") + (paths.length > 1 ? " paths." : " path.");
      note.hidden = false;
    }

    // Credits
    var cl = $("[data-credits-list]", root);
    course.channels.forEach(function (ch) {
      var n = course.items.filter(function (it) { return it.channel === ch; }).length;
      cl.appendChild(el("li", { text: ch + " (" + plural(n, "lesson") + ")" }));
    });
    $("[data-credits]", root).hidden = false;

    // Related courses: same topic first, then shared paths
    var related = data.list.filter(function (c) { return c !== course && c.category === course.category; });
    paths.forEach(function (p) { p.list.forEach(function (c) { if (c !== course && related.indexOf(c) < 0) related.push(c); }); });
    if (related.length) {
      var rl = $("[data-related]");
      related.slice(0, 4).forEach(function (c) { rl.appendChild(miniCard(c)); });
      $("[data-related-section]").hidden = false;
    }

    // Start / continue
    var start = $("[data-start]", root);
    var s = stats(course);
    start.href = courseUrl(course, resumeItem(course));
    start.textContent = hasStarted(course) ? "Continue (" + s.pct + "%)" : "Start course";
    start.hidden = false;

    // Sub-nav
    $all("[data-needs-data]", root).forEach(function (a) { a.hidden = false; });
    if ("IntersectionObserver" in window) {
      var links = $all("[data-subnav] a", root);
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id); });
        });
      }, { rootMargin: "-30% 0px -60% 0px" });
      links.forEach(function (a) { var t = document.getElementById(a.getAttribute("href").slice(1)); if (t) obs.observe(t); });
    }
  }

  /* ---------------- Player ---------------- */
  function initPlayer(data, course, itemId) {
    var item = course.items.find(function (it) { return it.id === itemId; });
    if (!item) return false;
    var root = $("[data-player]");
    var prog = courseProgress(course.id);
    prog.last = item.id;
    prog.updated = Date.now();
    save();

    document.title = item.title + " – " + course.title + " – LearnHub";
    var crumb = $("[data-crumb-lesson]");
    if (crumb) crumb.textContent = item.title;

    // Prev / next
    var prev = course.items[item.index - 1], next = course.items[item.index + 1];
    var nav = $("[data-nav]", root), prevBtn = $("[data-prev]", root), nextBtn = $("[data-next]", root);
    if (prev) { prevBtn.href = courseUrl(course, prev.id); prevBtn.title = prev.title; }
    else { prevBtn.setAttribute("aria-disabled", "true"); prevBtn.removeAttribute("href"); }
    if (next) { nextBtn.href = courseUrl(course, next.id); nextBtn.title = next.title; }
    else { nextBtn.href = courseUrl(course); nextBtn.replaceChildren("Finish"); }

    // Lesson list, grouped by module
    var list = $("[data-panel-list]", root);
    function renderPanel() {
      list.innerHTML = "";
      course.modules.forEach(function (m, mi) {
        list.appendChild(el("li", { class: "panel-mod", "aria-hidden": "true", text: "Module " + (mi + 1) + " · " + m.title }));
        m.lessons.concat(m.quizItem ? [m.quizItem] : []).forEach(function (it) {
          var done = isDone(course, it.id), current = it.id === item.id, quiz = it.kind === "quiz";
          list.appendChild(el("li", { class: (quiz ? "quiz-item " : "") + (done ? "done" : "") }, [
            el("a", { href: courseUrl(course, it.id), "aria-current": current ? "true" : null }, [
              icon(done ? "check-circle" : quiz ? "quiz" : current ? "play-circle" : "circle"),
              el("span", null, [
                it.title,
                done ? el("span", { class: "sr-only", text: " (completed)" }) : null,
                el("span", { class: "dur", text: quiz ? plural(it.questions.length, "question") : it.duration })
              ])
            ])
          ]));
        });
      });
      var s = stats(course);
      var bar = $("[data-progress]", root);
      bar.setAttribute("aria-valuenow", String(s.pct));
      bar.firstElementChild.style.width = s.pct + "%";
      $("[data-progress-label]", root).textContent = s.done + " of " + s.total + " items complete (" + s.pct + "%)";
    }
    function setDone(on) {
      prog.completed = prog.completed.filter(function (id) { return id !== item.id; });
      if (on) prog.completed.push(item.id);
      prog.updated = Date.now();
      save();
      renderPanel();
    }
    renderPanel();
    var current = $('[aria-current="true"]', list);
    if (current && window.matchMedia("(min-width: 1000px)").matches) {
      list.scrollTop = current.offsetTop - list.offsetTop - 80;
    }

    if (item.kind === "quiz") {
      $("[data-lesson-view]", root).hidden = true;
      renderQuiz(course, item, $("[data-quiz-view]", root), setDone, next);
    } else {
      $("[data-nav-slot]", root).appendChild(nav);
      renderLesson(course, item, root, setDone);
    }

    $("[data-overview]").hidden = true;
    root.hidden = false;
    return true;
  }

  function renderLesson(course, lesson, root, setDone) {
    var video = $("[data-video]", root);
    var startNote = lesson.start ? "Starts at " + fmtClock(lesson.start) + " · " : "";
    var facade = el("button", { type: "button", class: "video-facade", "aria-label": "Play video: " + lesson.title }, [
      thumbImg(lesson.youtubeId),
      el("span", { class: "play" }, [icon("play")]),
      el("span", { class: "facade-label", text: startNote + lesson.duration + " · " + lesson.channel })
    ]);
    $("img", facade).setAttribute("loading", "eager");
    facade.addEventListener("click", function () {
      var src = "https://www.youtube-nocookie.com/embed/" + lesson.youtubeId + "?autoplay=1&rel=0&modestbranding=1" +
        (lesson.start ? "&start=" + lesson.start : "") + (lesson.end ? "&end=" + lesson.end : "");
      var iframe = el("iframe", {
        src: src,
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

    var m = lesson.module;
    $("[data-lesson-module]", root).textContent = "Module " + (m.index + 1) + " · " + m.title + " · Lesson " + (m.lessons.indexOf(lesson) + 1) + " of " + m.lessons.length;
    $("[data-lesson-title]", root).textContent = lesson.title;
    var src = $("[data-lesson-source]", root);
    src.appendChild(document.createTextNode(lesson.start || lesson.end ? "From " : "Lecture: "));
    src.appendChild(el("a", { href: lesson.sourceUrl, target: "_blank", rel: "noopener" }, [lesson.sourceTitle]));
    src.appendChild(document.createTextNode(" by " + lesson.channel + " on YouTube" +
      (lesson.start || lesson.end ? " (" + fmtClock(lesson.start) + "–" + fmtClock(lesson.start + lesson.seconds) + ")" : " · " + lesson.duration)));

    var box = $("[data-complete]", root);
    box.checked = isDone(course, lesson.id);
    box.addEventListener("change", function () { setDone(box.checked); });

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
  }

  function renderQuiz(course, quiz, host, setDone, next) {
    var m = quiz.module, key = course.id + ":" + quiz.id, prev = state.quiz[key];
    host.hidden = false;
    var form = el("form", { class: "quiz", novalidate: "" });
    form.appendChild(el("div", { class: "quiz-head" }, [
      el("h2", { text: "Module " + (m.index + 1) + " quiz: " + m.title }),
      el("span", { class: "small muted", text: plural(quiz.questions.length, "question") + " · pass mark " + Math.round(PASS_MARK * 100) + "%" })
    ]));
    form.appendChild(el("p", { class: "quiz-intro", text: prev ? "Your best score so far: " + prev.best + " of " + prev.total + ". You can retake the quiz at any time." : "Check what you learned in this module. Answers are checked in your browser; nothing is sent anywhere." }));
    quiz.questions.forEach(function (qq, qi) {
      var fs = el("fieldset", { "data-q": String(qi) }, [
        el("legend", null, [el("span", { class: "q-num", text: (qi + 1) + "." }), qq.q])
      ]);
      var opts = el("div");
      qq.options.forEach(function (o, oi) {
        opts.appendChild(el("label", { class: "opt" }, [el("input", { type: "radio", name: "q" + qi, value: String(oi) }), el("span", { text: o })]));
      });
      fs.appendChild(opts);
      fs.appendChild(el("p", { class: "why", hidden: "" }));
      form.appendChild(fs);
    });
    var result = el("div", { class: "quiz-result", hidden: "", role: "status" });
    var submit = el("button", { type: "submit", class: "btn btn-primary", text: "Submit answers" });
    var retry = el("button", { type: "button", class: "btn btn-outline", text: "Retake quiz", hidden: "" });
    var go = next ? el("a", { class: "btn btn-outline", href: courseUrl(course, next.id), text: "Continue to next lesson", hidden: "" }) : null;
    form.appendChild(result);
    form.appendChild(el("div", { class: "quiz-actions" }, [submit, retry, go]));

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var score = 0, unanswered = 0;
      quiz.questions.forEach(function (qq, qi) {
        var fs = $('[data-q="' + qi + '"]', form);
        var picked = $("input:checked", fs);
        if (!picked) unanswered++;
        $all(".opt", fs).forEach(function (lab, oi) {
          lab.classList.toggle("correct", oi === qq.answer);
          lab.classList.toggle("wrong", !!picked && Number(picked.value) === oi && oi !== qq.answer);
          $("input", lab).disabled = true;
        });
        if (picked && Number(picked.value) === qq.answer) score++;
        var why = $(".why", fs);
        why.textContent = (picked && Number(picked.value) === qq.answer ? "Correct. " : picked ? "Not quite. " : "Not answered. ") + qq.explain;
        why.hidden = false;
      });
      var total = quiz.questions.length, passed = score / total >= PASS_MARK;
      var best = Math.max(score, prev ? prev.best : 0);
      state.quiz[key] = { best: best, last: score, total: total, at: Date.now() };
      save();
      if (passed) setDone(true);
      result.className = "quiz-result " + (passed ? "pass" : "fail");
      result.textContent = "You scored " + score + " of " + total + (passed ? ". Passed – this module quiz is marked complete." : ". You need " + Math.ceil(PASS_MARK * total) + " to pass. Review the lessons and try again.") +
        (unanswered ? " (" + plural(unanswered, "question") + " left blank.)" : "");
      result.hidden = false;
      submit.hidden = true;
      retry.hidden = false;
      if (go) go.hidden = false;
      result.focus && result.setAttribute("tabindex", "-1");
      result.focus();
    });
    retry.addEventListener("click", function () {
      $all("input", form).forEach(function (i) { i.disabled = false; i.checked = false; });
      $all(".opt", form).forEach(function (l) { l.classList.remove("correct", "wrong"); });
      $all(".why", form).forEach(function (w) { w.hidden = true; });
      result.hidden = true; submit.hidden = false; retry.hidden = true; if (go) go.hidden = true;
      $("input", form).focus();
    });
    host.appendChild(form);
  }

  function initCoursePage(data) {
    var page = $("[data-course-page]");
    if (!page) return;
    var course = findCourse(data, page.dataset.courseId, page.dataset.courseTitle);
    if (!course) return; // no lesson data: the server-rendered overview stays as is
    var itemId = new URLSearchParams(location.search).get("lesson");
    if (itemId && initPlayer(data, course, itemId)) return;
    initOverview(data, course);
  }

  /* ---------------- My Learning ---------------- */
  function initMyLearning(data) {
    if (body.dataset.page !== "my_enrollments") return;
    // Course ids for links come from the JSON; enrollment rows give us titles.
    function render() {
      var started = startedCourses(data);
      var inList = $("[data-in-progress-list]");
      inList.innerHTML = "";
      started.forEach(function (c) { inList.appendChild(learningItem(c, { progress: true })); });
      $("[data-in-progress]").hidden = !started.length;

      var saved = state.saved.map(function (id) {
        return data.list.find(function (c) { return (c.dbId || c.id) === id; });
      }).filter(Boolean);
      var sList = $("[data-saved-list]");
      sList.innerHTML = "";
      saved.forEach(function (c) { sList.appendChild(learningItem(c, { removable: true, onChange: render })); });
      $("[data-saved]").hidden = !saved.length;
    }
    render();

    $all("[data-enrollment]").forEach(function (row) {
      var c = data.byTitle[row.dataset.courseTitle];
      var cell = $("[data-enrollment-action]", row);
      if (!c || !cell) return;
      var s = stats(c);
      cell.appendChild(el("a", { class: "btn btn-outline btn-sm", href: courseUrl(c, resumeItem(c)),
        text: hasStarted(c) ? "Continue (" + s.pct + "%)" : "Start" }));
    });

    var input = $("#email");
    var params = new URLSearchParams(location.search);
    if (params.get("email") && $("[data-enrollment]")) { state.email = params.get("email"); save(); }
    else if (input && !input.value && state.email) { input.value = state.email; }
  }

  /* ---------------- Boot ---------------- */
  initTheme();
  initMenus();
  initSaveButtons(document);
  loadData().then(function (data) {
    initHome(data);
    initCoursePage(data);
    initMyLearning(data);
    initSaveButtons(document);
  });
})();
