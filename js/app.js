(() => {
  "use strict";

  const C = window.FFN_CONFIG || {};
  const channel = C.channel || {};
  const leagues = Array.isArray(C.leagues) ? C.leagues : [];
  const liveMs = (C.liveWindowHours || 3.5) * 3600 * 1000;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const emptyLeague = { id: "", name: "League", teams: {}, schedule: [], games: [] };

  const $ = (sel) => document.querySelector(sel);

  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [key, val] of Object.entries(props)) {
      if (val == null || val === false) continue;
      if (key === "class") node.className = val;
      else if (key === "text") node.textContent = val;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), val);
      else node.setAttribute(key, val === true ? "" : val);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return node;
  }

  /* ---------- state ---------- */
  let league = emptyLeague;
  let currentVideo = null;
  const state = { season: "all", q: "" };

  /* ---------- helpers ---------- */
  const teamOf = (key, lg = league) =>
    (lg.teams || {})[key] || { name: key, abbr: String(key).slice(0, 3).toUpperCase(), color: "#6b7280" };
  const rk = (n) => (n ? `#${n} ` : "");
  const matchup = (g, lg = league) => `${rk(g.awayRank)}${teamOf(g.away, lg).name} at ${rk(g.homeRank)}${teamOf(g.home, lg).name}`;
  const hasScore = (g) => Number.isFinite(g.awayScore) && Number.isFinite(g.homeScore);
  const gameDate = (g) => (g.date ? new Date(`${g.date}T12:00:00`) : null);
  const fmtDay = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const leagueGames = (lg = league) =>
    (lg.games || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.week || 0) - (a.week || 0));

  // A game is live when it has a stream link (until its window ends, if it has a
  // start time), or when the clock is inside its start-time window.
  function isLive(s, now = Date.now()) {
    const t = s.start ? Date.parse(s.start) : NaN;
    if (s.liveVideo) return Number.isNaN(t) || now <= t + liveMs;
    return !Number.isNaN(t) && now >= t && now <= t + liveMs;
  }
  function liveEntryIn(lg) {
    const list = lg.schedule || [];
    return list.find((s) => s.liveVideo && isLive(s)) || list.find((s) => isLive(s));
  }
  const canPlayLive = (entry) => !!(entry && (entry.liveVideo || channel.id));
  function liveNow() {
    for (const lg of leagues) {
      const entry = liveEntryIn(lg);
      if (entry) return { lg, entry };
    }
    return null;
  }

  function startsIn(ms) {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `Starts in ${Math.max(mins, 1)} min`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `Starts in ${hrs} ${hrs === 1 ? "hour" : "hours"}`;
    const days = Math.round(hrs / 24);
    return `Starts in ${days} ${days === 1 ? "day" : "days"}`;
  }

  /* ---------- player ---------- */
  const playerEl = $("#player");
  const nowEl = $("#now");
  const livePill = $("#live-pill");

  function frame(src, title) {
    return el("iframe", {
      src, title,
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
      allowfullscreen: true,
      referrerpolicy: "strict-origin-when-cross-origin"
    });
  }

  function emptyPanel(title, body) {
    return el("div", { class: "player-empty" },
      el("span", { class: "brand-mark", text: "FFN" }),
      el("p", { class: "empty-title", text: title }),
      el("p", { class: "empty-body", text: body })
    );
  }

  function bug(g) {
    const scored = hasScore(g);
    const side = (key, score, won) => {
      const t = teamOf(key);
      return el("span", { class: "bug-team" + (won ? " won" : "") },
        el("i", { class: "bug-swatch", style: `background:${t.color}` }),
        el("b", { class: "bug-abbr", text: t.abbr }),
        scored && el("span", { class: "bug-score", text: String(score) })
      );
    };
    return el("div", { class: "bug" },
      side(g.away, g.awayScore, scored && g.awayScore > g.homeScore),
      side(g.home, g.homeScore, scored && g.homeScore > g.awayScore)
    );
  }

  function actions(extra, quietSubscribe = false) {
    const subscribe = channel.url ? `${channel.url}${channel.url.includes("?") ? "&" : "?"}sub_confirmation=1` : "";
    return el("div", { class: "actions" },
      extra,
      (channel.id || liveEntryIn(league)) && el("button", { class: "btn btn-ghost", type: "button", text: "Watch live", onclick: () => playLive(true) }),
      subscribe && el("a", { class: "btn " + (quietSubscribe ? "btn-ghost" : "btn-flag"), href: subscribe, target: "_blank", rel: "noopener", text: "Subscribe" })
    );
  }

  const gameMeta = (g) => [g.label, g.week ? `Week ${g.week}` : "", `Season ${g.season}`, gameDate(g) ? fmtDay(gameDate(g)) : ""].filter(Boolean).join(". ") + ".";

  function playGame(g, { autoplay = false } = {}) {
    currentVideo = g.video || null;
    const src = g.video
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(g.video)}?rel=0${autoplay ? "&autoplay=1" : ""}`
      : null;
    playerEl.replaceChildren(src
      ? frame(src, `${matchup(g)}, season ${g.season} week ${g.week}`)
      : emptyPanel("No video for this game", "There\u2019s no stream recording linked for this game, so there\u2019s nothing to play."));

    nowEl.replaceChildren(
      bug(g),
      el("div", { class: "now-meta" },
        el("p", { class: "now-title", text: matchup(g) }),
        el("p", { class: "now-sub", text: `${league.name}. ${gameMeta(g)}` })
      ),
      actions(g.video && el("a", {
        class: "btn btn-ghost", target: "_blank", rel: "noopener", text: "Open on YouTube",
        href: `https://www.youtube.com/watch?v=${encodeURIComponent(g.video)}`
      }))
    );
    markCurrent();
  }

  function playLive(autoplay = false) {
    currentVideo = null;
    const entry = liveEntryIn(league);
    if (entry && entry.liveVideo) {
      playerEl.replaceChildren(frame(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(entry.liveVideo)}?rel=0${autoplay ? "&autoplay=1" : ""}`, `${matchup(entry)} live`));
    } else if (channel.id) {
      const q = `channel=${encodeURIComponent(channel.id)}${autoplay ? "&autoplay=1" : ""}`;
      playerEl.replaceChildren(frame(`https://www.youtube.com/embed/live_stream?${q}`, "FFN live stream"));
    } else {
      playerEl.replaceChildren(emptyPanel("Live stream unavailable", "The live stream isn\u2019t connected on this site yet. Watch on YouTube instead."));
    }
    const hint = "If the player says the stream is offline, check the schedule.";
    nowEl.replaceChildren(
      el("span", { class: "live-tag" }, el("span", { class: "dot", "aria-hidden": "true" }), "Live now"),
      el("div", { class: "now-meta" },
        el("p", { class: "now-title", text: entry ? matchup(entry) : "FFN live stream" }),
        el("p", { class: "now-sub", text: entry ? `${league.name}${entry.label ? `, ${entry.label}` : ""}. ${hint}` : hint })
      ),
      actions()
    );
    history.replaceState(null, "", location.pathname + location.search);
    markCurrent();
  }

  // The next game still to be played (soonest dated one first, then undated ones).
  function nextUp() {
    const now = Date.now();
    return (league.schedule || [])
      .map((s) => ({ ...s, t: s.start ? Date.parse(s.start) : NaN }))
      .filter((s) => Number.isNaN(s.t) || s.t + liveMs > now)
      .sort((a, b) => (Number.isNaN(a.t) - Number.isNaN(b.t)) || a.t - b.t)[0] || null;
  }

  // Nothing live and nothing recorded to play: say so, instead of showing a dead player.
  function showIdle() {
    currentVideo = null;
    const next = nextUp();
    const when = next && !Number.isNaN(next.t)
      ? new Date(next.t).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "Date TBD";
    playerEl.replaceChildren(emptyPanel(
      "Nothing live right now",
      "Games go live on the channel on game days. Past games are in the archive below."));
    nowEl.replaceChildren(
      el("div", { class: "now-meta" },
        el("p", { class: "now-title", text: next ? matchup(next) : league.name }),
        el("p", { class: "now-sub", text: next ? `Next up. ${[next.label, when].filter(Boolean).join(". ")}` : "Subscribe on YouTube so you don\u2019t miss the next stream." })
      ),
      actions()
    );
    markCurrent();
  }

  function showEmptyLeague() {
    currentVideo = null;
    playerEl.replaceChildren(emptyPanel("No games posted yet", `${league.name} games show up here after they stream.`));
    nowEl.replaceChildren(
      el("div", { class: "now-meta" },
        el("p", { class: "now-title", text: league.name }),
        el("p", { class: "now-sub", text: "Subscribe on YouTube so you don\u2019t miss the next stream." })
      ),
      actions()
    );
    markCurrent();
  }

  // The matchup to feature when nothing is live: the Game of the Week if one is
  // scheduled, otherwise whatever is next on the slate.
  function featured() {
    const now = Date.now();
    const upcoming = (league.schedule || [])
      .map((s) => ({ ...s, t: s.start ? Date.parse(s.start) : NaN }))
      .filter((s) => Number.isNaN(s.t) || s.t + liveMs > now);
    const gotw = upcoming.find((s) => /game of the week/i.test(s.label || ""));
    return gotw ? { entry: gotw, isGotw: true } : (nextUp() ? { entry: nextUp(), isGotw: false } : null);
  }

  function watchLatestButton() {
    const g = leagueGames().find((x) => x.video);
    if (g) return el("button", { class: "btn btn-flag", type: "button", text: "Watch latest", onclick: () => openGame(g) });
    if (channel.url) return el("a", { class: "btn btn-flag", href: `${channel.url.replace(/\/$/, "")}/videos`, target: "_blank", rel: "noopener", text: "Watch latest" });
    return null;
  }

  function showSpotlight(pick) {
    currentVideo = null;
    const s = pick.entry;
    const side = (key, rank) => {
      const t = teamOf(key);
      return el("span", { class: "spot-side", style: `background:${t.color};color:${inkOn(t.color)}` },
        el("span", { class: "spot-rank", text: rank ? `#${rank}` : "\u00a0" }),
        el("b", { class: "spot-abbr", text: t.abbr }),
        el("span", { class: "spot-name", text: t.name }));
    };
    const dated = !Number.isNaN(s.t) && !!s.start;
    const tag = pick.isGotw ? "Game of the Week" : dated ? "Next up" : "This week";
    const when = !dated ? "Date TBD"
      : new Date(s.start).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    playerEl.replaceChildren(el("div", { class: "spotlight" },
      el("span", { class: "spot-tag", text: tag }),
      side(s.away, s.awayRank),
      el("span", { class: "spot-at", "aria-hidden": "true", text: "at" }),
      side(s.home, s.homeRank),
      el("span", { class: "spot-when", text: when })));
    nowEl.replaceChildren(
      el("div", { class: "now-meta" },
        el("p", { class: "now-title", text: matchup(s) }),
        el("p", { class: "now-sub", text: [s.label, when].filter(Boolean).join(". ") })
      ),
      actions(watchLatestButton(), true)
    );
    markCurrent();
  }

  function defaultView() {
    if (canPlayLive(liveEntryIn(league))) return playLive();
    const pick = featured();
    if (pick) return showSpotlight(pick);
    const games = leagueGames();
    const latest = games.find((g) => g.video);
    if (latest) return playGame(latest);
    if (games.length || nextUp()) return showIdle();
    showEmptyLeague();
  }

  /* ---------- leagues ---------- */
  const tabsEl = $("#league-tabs");

  const headEl = $("#league-head");

  // League header (RCFL . Season 6 . Week 9). League switching now lives in the top bar.
  function renderTabs() {
    tabsEl.hidden = true;
    headEl.hidden = !leagues.length;
    const games = leagueGames();
    const season = games.reduce((m, g) => Math.max(m, g.season || 0), 0);
    const latest = games.find((g) => g.week && (!season || g.season === season));
    const bits = [season ? `Season ${season}` : "", latest ? `Week ${latest.week}` : ""].filter(Boolean);
    headEl.replaceChildren(
      el("span", { class: "lh-name", text: league.name }),
      ...bits.flatMap((b) => [el("span", { class: "lh-dot", "aria-hidden": "true", text: "\u00b7" }), el("span", { class: "lh-meta", text: b })])
    );
  }

  function setLeague(lg, { remember = true } = {}) {
    league = lg;
    state.season = "all";
    state.q = "";
    searchEl.value = "";
    if (remember) {
      try { localStorage.setItem("ffn-league", lg.id); } catch (e) {}
      history.replaceState(null, "", `#league=${encodeURIComponent(lg.id)}`);
    }
    renderTabs();
    renderSeasons();
    renderRows();
    renderSchedule();
  }

  /* ---------- score strip ---------- */
  const stripBox = $("#scorestrip");
  const stripEl = $("#strip");
  const stripPrev = $("#strip-prev");
  const stripNext = $("#strip-next");

  function updateArrows() {
    stripPrev.disabled = stripEl.scrollLeft < 4;
    stripNext.disabled = stripEl.scrollLeft + stripEl.clientWidth >= stripEl.scrollWidth - 4;
  }
  const nudge = (dir) => stripEl.scrollBy({ left: dir * stripEl.clientWidth * 0.8, behavior: reduceMotion ? "auto" : "smooth" });
  stripPrev.addEventListener("click", () => nudge(-1));
  stripNext.addEventListener("click", () => nudge(1));
  stripEl.addEventListener("scroll", updateArrows, { passive: true });
  window.addEventListener("resize", updateArrows);

  function stripCell(g, kind) {
    const scored = kind === "final" && hasScore(g);
    const t0 = g.start ? Date.parse(g.start) : NaN;
    let status;
    if (kind === "live") status = "Live";
    else if (kind === "final") status = ["Final", gameDate(g) ? gameDate(g).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""].filter(Boolean).join(" \u00b7 ");
    else if (Number.isNaN(t0)) status = "TBD";
    else status = new Date(t0).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
    if (kind !== "final" && g.label) status += ` \u00b7 ${g.label}`;

    const team = (key, rank, val, won) => {
      const t = teamOf(key);
      return el("span", { class: "sc-team" + (scored && !won ? " lose" : "") },
        el("i", { class: "sc-swatch", style: `background:${t.color}` }),
        el("span", { class: "sc-name" }, rank ? el("span", { class: "sc-rank", text: `#${rank}` }) : null, t.name),
        scored && el("span", { class: "sc-score", text: String(val) }));
    };

    const playable = kind === "final" ? !!g.video : kind === "live" && canPlayLive(g);
    const onclick = kind === "final"
      ? () => openGame(g)
      : () => { playLive(true); $("#watch").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); };
    return el(playable ? "button" : "div", {
      class: `sc ${kind}`, type: playable ? "button" : null, "data-video": kind === "final" && g.video ? g.video : "",
      onclick: playable ? onclick : null
    },
      el("span", { class: "sc-status" }, kind === "live" && el("span", { class: "dot", "aria-hidden": "true" }), el("span", { class: "sc-status-text", text: status })),
      team(g.away, g.awayRank, g.awayScore, scored && g.awayScore > g.homeScore),
      team(g.home, g.homeRank, g.homeScore, scored && g.homeScore > g.awayScore));
  }

  function renderStrip() {
    const now = Date.now();
    const sched = (league.schedule || [])
      .map((s) => ({ ...s, t: s.start ? Date.parse(s.start) : NaN }))
      .filter((s) => isLive(s, now) || Number.isNaN(s.t) || s.t + liveMs > now)
      .sort((a, b) => (Number.isNaN(a.t) - Number.isNaN(b.t)) || a.t - b.t);
    const cells = [
      ...sched.filter((s) => isLive(s, now)).map((s) => stripCell(s, "live")),
      ...leagueGames().slice(0, 10).map((g) => stripCell(g, "final")),
      ...sched.filter((s) => !isLive(s, now)).map((s) => stripCell(s, "up"))
    ];
    stripBox.hidden = !cells.length || view.name !== "league";
    stripEl.replaceChildren(...cells);
    stripEl.scrollLeft = 0;
    updateArrows();
    markCurrent();
  }

  /* ---------- schedule ---------- */
  const schedList = $("#sched-list");

  function renderSchedule() {
    renderStrip();
    const now = Date.now();
    livePill.hidden = !liveNow();

    const items = (league.schedule || [])
      .map((s) => ({ ...s, t: s.start ? Date.parse(s.start) : NaN }))
      .filter((s) => isLive(s, now) || Number.isNaN(s.t) || s.t + liveMs > now)
      .sort((a, b) => (isLive(b, now) - isLive(a, now)) || (Number.isNaN(a.t) - Number.isNaN(b.t)) || a.t - b.t);

    if (!items.length) {
      schedList.replaceChildren(el("li", { class: "sched-empty", text: "No games on the schedule right now. New dates get posted on the channel." }));
      return;
    }

    const nodes = [];
    let sawTbd = false;
    items.forEach((s, i) => {
      const tbd = Number.isNaN(s.t);
      const d = tbd ? null : new Date(s.t);
      const live = isLive(s, now);
      if (tbd && !sawTbd) { sawTbd = true; nodes.push(el("li", { class: "sched-group", text: "Date TBD" })); }
      const cls = "sched-item" + (tbd ? " tbd" : "") + (live ? " is-live" : !tbd && i === 0 && s.t > now ? " is-next" : "");
      nodes.push(el("li", { class: cls },
        !tbd && el("div", { class: "sched-when", text: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) }),
        !tbd && el("div", { class: "sched-time", text: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }) }),
        el("div", { class: "sched-match", text: matchup(s) }),
        el("div", { class: "sched-meta", text: [s.label, !tbd && !live && i === 0 && s.t > now ? startsIn(s.t - now) : ""].filter(Boolean).join(". ") }),
        live && el("span", { class: "live-tag" }, el("span", { class: "dot", "aria-hidden": "true" }), "Live now")
      ));
    });
    schedList.replaceChildren(...nodes);
  }

  /* ---------- archive ---------- */
  const rowsEl = $("#rows");
  const countEl = $("#count");
  const seasonsEl = $("#seasons");
  const searchEl = $("#search");
  const filtersEl = document.querySelector(".filters");

  function renderSeasons() {
    const seasonList = [...new Set(leagueGames().map((g) => g.season))].sort((a, b) => b - a);
    filtersEl.hidden = !seasonList.length;
    const opts = [["all", "All seasons"], ...seasonList.map((s) => [String(s), `Season ${s}`])];
    seasonsEl.hidden = seasonList.length < 2;
    seasonsEl.replaceChildren(...opts.map(([val, label]) =>
      el("button", {
        type: "button", text: label, "aria-pressed": String(state.season === val),
        onclick: () => { state.season = val; renderSeasons(); renderRows(); }
      })
    ));
  }

  function openGame(g) {
    playGame(g, { autoplay: true });
    if (g.video) history.replaceState(null, "", `#v=${encodeURIComponent(g.video)}`);
    $("#watch").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  // Pick black or white text for a given background color.
  function inkOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#fff";
    const n = parseInt(m[1], 16);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return L > 0.3 ? "#111" : "#fff";
  }

  function thumb(g) {
    const scored = hasScore(g);
    const badge = el("span", { class: "badge", text: g.video ? (scored ? "Final" : "Game") : "No video" });
    if (g.video) {
      return el("span", { class: "thumb" },
        el("img", { src: `https://i.ytimg.com/vi/${encodeURIComponent(g.video)}/mqdefault.jpg`, alt: "", loading: "lazy" }),
        badge, el("span", { class: "play", "aria-hidden": "true" }));
    }
    const half = (key, rank) => {
      const t = teamOf(key);
      return el("span", { class: "half", style: `background:${t.color};color:${inkOn(t.color)}` },
        el("span", { class: "half-rank", text: rank ? `#${rank}` : "\u00a0" }),
        el("b", { class: "half-abbr", text: t.abbr }));
    };
    return el("span", { class: "thumb blank" },
      half(g.away, g.awayRank),
      el("span", { class: "vs", "aria-hidden": "true", text: "at" }),
      half(g.home, g.homeRank),
      badge);
  }

  function cardTeam(key, rank, scoreVal, scored, won) {
    const t = teamOf(key);
    return el("span", { class: "card-team" + (scored && !won ? " lose" : "") },
      el("i", { class: "swatch", style: `background:${t.color}` }),
      el("span", { class: "tname" }, rank ? el("span", { class: "trank", text: `#${rank}` }) : null, t.name),
      scored && el("span", { class: "tscore", text: String(scoreVal) }));
  }

  function card(g) {
    const scored = hasScore(g);
    const body = [
      thumb(g),
      el("span", { class: "card-body" },
        el("span", { class: "card-teams" },
          cardTeam(g.away, g.awayRank, g.awayScore, scored, scored && g.awayScore > g.homeScore),
          cardTeam(g.home, g.homeRank, g.homeScore, scored, scored && g.homeScore > g.awayScore)),
        el("span", { class: "card-sub", text: gameMeta(g) }))
    ];
    return g.video
      ? el("button", { class: "card", type: "button", "data-video": g.video, onclick: () => openGame(g) }, body)
      : el("div", { class: "card static", "data-video": "" }, body);
  }

  function renderRows() {
    const all = leagueGames();
    const q = state.q.trim().toLowerCase();
    const list = all.filter((g) => {
      if (state.season !== "all" && String(g.season) !== state.season) return false;
      if (!q) return true;
      return [teamOf(g.away).name, teamOf(g.home).name, teamOf(g.away).abbr, teamOf(g.home).abbr].join(" ").toLowerCase().includes(q);
    });

    countEl.textContent = all.length ? `${list.length} ${league.name} ${list.length === 1 ? "game" : "games"}` : "";

    if (!list.length) {
      rowsEl.replaceChildren(el("li", {
        class: "rows-empty",
        text: all.length ? "No games match. Try a different team name or switch seasons." : `No ${league.name} games have been posted yet.`
      }));
      return;
    }

    rowsEl.replaceChildren(...list.map((g) => el("li", {}, card(g))));
    markCurrent();
  }

  function markCurrent() {
    document.querySelectorAll(".card, .sc").forEach((r) => {
      const on = currentVideo && r.dataset.video === currentVideo;
      if (on) r.setAttribute("aria-current", "true"); else r.removeAttribute("aria-current");
    });
  }

  searchEl.addEventListener("input", () => { state.q = searchEl.value; renderRows(); });

  /* ---------- about + links ---------- */
  $("#about-text").replaceChildren(...(C.about || []).map((t) => el("p", { text: t })));

  const linkLabels = { discord: "Discord", x: "X", instagram: "Instagram", tiktok: "TikTok" };
  const linkItems = [];
  if (channel.url) linkItems.push(["YouTube", channel.url]);
  for (const [key, label] of Object.entries(linkLabels)) {
    if ((C.links || {})[key]) linkItems.push([label, C.links[key]]);
  }
  $("#link-list").replaceChildren(...linkItems.map(([label, href]) =>
    el("li", {}, el("a", { href, target: "_blank", rel: "noopener", text: label }))));

  $("#year").textContent = new Date().getFullYear();

  /* ---------- light / dark ---------- */
  const themeBtn = $("#theme-toggle");
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let savedTheme = null;
  try { savedTheme = localStorage.getItem("ffn-theme"); } catch (e) {}

  function applyTheme(mode, save) {
    document.documentElement.setAttribute("data-theme", mode);
    themeBtn.setAttribute("aria-pressed", String(mode === "dark"));
    themeBtn.setAttribute("aria-label", mode === "dark" ? "Switch to light mode" : "Switch to dark mode");
    if (save) { try { localStorage.setItem("ffn-theme", mode); } catch (e) {} savedTheme = mode; }
  }

  applyTheme(document.documentElement.getAttribute("data-theme") || (darkQuery.matches ? "dark" : "light"), false);
  themeBtn.addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
  });
  darkQuery.addEventListener("change", (e) => { if (!savedTheme) applyTheme(e.matches ? "dark" : "light", false); });

  /* ---------- beta notice (shows on each new visit, dismiss for the session) ---------- */
  const betaEl = $("#beta-banner");
  let betaSeen = false;
  try { betaSeen = sessionStorage.getItem("ffn-beta") === "1"; } catch (e) {}
  betaEl.hidden = betaSeen;
  $("#beta-close").addEventListener("click", () => {
    betaEl.hidden = true;
    try { sessionStorage.setItem("ffn-beta", "1"); } catch (e) {}
  });

  /* ---------- beta popup (once per visit) ---------- */
  const betaModal = $("#beta-modal");
  let modalSeen = false;
  try { modalSeen = sessionStorage.getItem("ffn-beta-popup") === "1"; } catch (e) {}
  if (!modalSeen && typeof betaModal.showModal === "function") {
    betaModal.showModal();
    betaModal.addEventListener("close", () => {
      betaEl.hidden = true;
      try { sessionStorage.setItem("ffn-beta-popup", "1"); sessionStorage.setItem("ffn-beta", "1"); } catch (e) {}
    });
    $("#beta-modal-ok").addEventListener("click", () => betaModal.close());
  }

  /* ---------- overview bar + views ---------- */
  const hubEl = $("#hub");
  const barItems = $("#hub-items");
  const backBtn = $("#hub-back");
  let view = { name: "home" };
  const trail = [];

  function findVideo(id) {
    for (const lg of leagues) {
      const g = (lg.games || []).find((x) => x.video === id);
      if (g) return { lg, g };
    }
    return null;
  }

  function tile(title, sub, onclick) {
    return el("button", { class: "tile", type: "button", onclick }, el("b", { text: title }), el("span", { text: sub }));
  }

  function renderHub() {
    if (view.name === "leagues") {
      hubEl.replaceChildren(
        el("h1", { text: "Leagues" }),
        el("p", { class: "hub-sub", text: "Pick a league to see its schedule, scores, and streams." }),
        el("div", { class: "tiles" }, leagues.map((lg) => {
          const n = (lg.games || []).length;
          return tile(lg.name, `${n} ${n === 1 ? "game" : "games"} posted`, () => go({ name: "league", leagueId: lg.id }));
        }))
      );
      return;
    }
    hubEl.replaceChildren(
      el("h1", { text: "Football Fusion Nation" }),
      el("p", { class: "hub-sub", text: "Football Fusion 3 league games, live and on demand." }),
      el("div", { class: "tiles" },
        tile("Channel", "Live stream, about FFN, and our links.", () => go({ name: "channel" })),
        tile("League", "Schedules, scores, and streams.", () => go({ name: "leagues" })))
    );
  }

  function renderBar() {
    const n = view.name;
    const root = n === "home" || n === "channel";
    const items = root
      ? [["Channel", n === "channel", () => go({ name: "channel" })], ["League", false, () => go({ name: "leagues" })]]
      : leagues.map((lg) => [lg.name, n === "league" && view.leagueId === lg.id, () => go({ name: "league", leagueId: lg.id })]);
    barItems.replaceChildren(...items.map(([label, on, fn]) =>
      el("button", { type: "button", text: label, "aria-current": on ? "page" : null, onclick: fn })));
    backBtn.disabled = !trail.length;
  }

  function applyView() {
    const n = view.name;
    document.body.dataset.view = n;
    hubEl.hidden = !(n === "home" || n === "leagues");
    $("#watch").hidden = !(n === "channel" || n === "league");
    $("#archive").hidden = n !== "league";
    $("#about").hidden = n !== "channel";
    if (n === "league") {
      setLeague(leagues.find((lg) => lg.id === view.leagueId) || leagues[0] || emptyLeague, { remember: false });
      defaultView();
    } else if (n === "channel") {
      const live = liveNow();
      setLeague(live ? live.lg : (leagues[0] || emptyLeague), { remember: false });
      if (live && canPlayLive(live.entry)) playLive(); else defaultView();
    } else {
      playerEl.replaceChildren();      // stop any video that was playing
      currentVideo = null;
      stripBox.hidden = true;
      renderHub();
    }
    if (n !== "league") history.replaceState(null, "", location.pathname + location.search);
    renderBar();
    window.scrollTo(0, 0);
  }

  function go(next, { push = true } = {}) {
    if (push && (next.name !== view.name || next.leagueId !== view.leagueId)) trail.push(view);
    view = next;
    applyView();
  }

  backBtn.addEventListener("click", () => {
    if (!trail.length) return;
    view = trail.pop();
    applyView();
  });

  $("#brand").addEventListener("click", (e) => {
    e.preventDefault();
    trail.length = 0;
    go({ name: "home" }, { push: false });
  });

  livePill.addEventListener("click", (e) => {
    e.preventDefault();
    const live = liveNow();
    if (!live) return;
    go({ name: "league", leagueId: live.lg.id });
    playLive();
  });

  window.addEventListener("hashchange", () => {
    const id = new URLSearchParams(location.hash.slice(1)).get("v");
    const found = id && findVideo(id);
    if (found) {
      if (view.name !== "league" || found.lg !== league) go({ name: "league", leagueId: found.lg.id });
      playGame(found.g);
    }
  });

  /* ---------- start ---------- */
  function start() {
    const params = new URLSearchParams(location.hash.slice(1));
    const found = params.get("v") && findVideo(params.get("v"));
    if (found) {
      go({ name: "league", leagueId: found.lg.id }, { push: false });
      return playGame(found.g);
    }
    const lid = params.get("league");
    if (lid && leagues.some((lg) => lg.id === lid)) return go({ name: "league", leagueId: lid }, { push: false });
    go({ name: "home" }, { push: false });
  }

  start();
  setInterval(renderSchedule, 60000);
})();
