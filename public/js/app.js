/**
 * Returns the Authorization header for protected API calls.
 *
 * The Firebase ID token is stored at login by /js/login.js. When the server runs
 * with AUTH_REQUIRED=true, omitting this yields a 401. The SSE stream does not
 * need it: EventSource cannot set headers, so the server also accepts the
 * __session cookie set at login.
 *
 * @returns {Record<string, string>}
 */
const authHeaders = () => {
  const token = localStorage.getItem("llmCouncilIdToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const map = L.map("india-map", {
  zoomControl: false,
  attributionControl: false,
  zoomSnap: 0.25,
  zoomDelta: 0.25,
  inertia: false,
  preferCanvas: false,
});

const mapContainer = document.getElementById("india-map");

const addGlowFilter = () => {
  const svg = map.getPanes().overlayPane.querySelector("svg");
  if (!svg || svg.querySelector("#state-glow")) {
    return;
  }

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filter.setAttribute("id", "state-glow");
  filter.setAttribute("x", "-40%");
  filter.setAttribute("y", "-40%");
  filter.setAttribute("width", "180%");
  filter.setAttribute("height", "180%");

  const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
  blur.setAttribute("stdDeviation", "6");
  blur.setAttribute("result", "coloredBlur");

  const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
  const mergeNode1 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
  mergeNode1.setAttribute("in", "coloredBlur");
  const mergeNode2 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
  mergeNode2.setAttribute("in", "SourceGraphic");

  merge.appendChild(mergeNode1);
  merge.appendChild(mergeNode2);

  filter.appendChild(blur);
  filter.appendChild(merge);
  defs.appendChild(filter);
  svg.appendChild(defs);
};

const STATES_GEOJSON_URL = "/map/india-states.geojson";

const stateNameToLayers = new Map();
const normalizeStateName = (value) => {
  const normalized = (value || "").toLowerCase().replace(/\s+/g, " ").trim();
  const aliases = {
    "nct of delhi": "delhi",
    "national capital territory of delhi": "delhi",
  };
  return aliases[normalized] || normalized;
};

const getStateLayers = (stateName) => stateNameToLayers.get(stateName) || [];

const baseStateStyle = {
  className: "state-path",
  fillColor: "#090909",
  fillOpacity: 0.28,
  color: "rgba(255, 255, 255, 0.15)",
  weight: 1.2,
};

const positiveStateStyle = {
  className: "state-path",
  fillColor: "rgba(56, 204, 118, 0.55)",
  fillOpacity: 0.6,
  color: "rgba(56, 204, 118, 0.9)",
  weight: 1.4,
};

const negativeStateStyle = {
  className: "state-path",
  fillColor: "rgba(230, 74, 74, 0.55)",
  fillOpacity: 0.6,
  color: "rgba(230, 74, 74, 0.9)",
  weight: 1.4,
};

const activeStateStyle = {
  className: "state-path",
  fillColor: "rgba(255, 255, 255, 0.45)",
  fillOpacity: 0.65,
  color: "rgba(255, 255, 255, 0.85)",
  weight: 1.8,
};

const stateLayer = L.geoJSON(null, {
  style: baseStateStyle,
  onEachFeature: (feature, layer) => {
    console.log(`[MAP LOAD] Properties:`, feature.properties);
    const name = feature.properties?.ST_NM || feature.properties?.NAME_1 || feature.properties?.state || feature.properties?.name || "Unknown";
    const normalized = normalizeStateName(name);
    console.log(`[MAP LOAD] State: "${name}" -> normalized: "${normalized}"`);
    const list = stateNameToLayers.get(normalized) || [];
    list.push(layer);
    stateNameToLayers.set(normalized, list);

    layer.on("click", () => {
      console.log(`State clicked: ${name}`);
      layer.getElement()?.classList.toggle("active");
    });

    layer.on("mouseover", () => {
      layer.getElement()?.classList.add("hovered");
    });

    layer.on("mouseout", () => {
      layer.getElement()?.classList.remove("hovered");
    });
  },
});

fetch(STATES_GEOJSON_URL)
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((geojson) => {
    stateLayer.addData(geojson).addTo(map);
    map.fitBounds(stateLayer.getBounds(), {
      padding: [16, 16],
      maxZoom: 6.5,
    });
    addGlowFilter();
    stateImpact.forEach((impact, stateName) => {
      const layers = getStateLayers(stateName);
      layers.forEach((layer) => {
        if (impact === "positive") {
          layer.setStyle(positiveStateStyle);
        } else if (impact === "negative") {
          layer.setStyle(negativeStateStyle);
        } else {
          layer.setStyle(baseStateStyle);
        }
      });
    });
  })
  .catch((error) => {
    console.error("Failed to load map data:", error);
    mapContainer.innerHTML =
      "<div style='color:#777;padding:20px;font-size:12px;'>Map data failed to load.</div>";
  });

const resizeObserver = new ResizeObserver(() => {
  map.invalidateSize();
  if (stateLayer.getLayers().length) {
    map.fitBounds(stateLayer.getBounds(), {
      padding: [16, 16],
      maxZoom: map.getZoom(),
    });
  }
});

resizeObserver.observe(mapContainer);

const feedList = document.getElementById("feed-list");
const feedBody = document.getElementById("feed-body");
const feedEmpty = document.getElementById("feed-empty");
const deliberationList = document.getElementById("deliberation-list");
const layoutElement = document.querySelector(".layout");
const topicText = document.getElementById("topic-text");
const agentCards = new Map();
const statusConnection = document.getElementById("status-connection");
const statusModel = document.getElementById("status-model");
const statusStrip = statusModel?.parentElement || null;
const topbarRight = document.querySelector(".topbar__right");
const fetchNextBtn = document.getElementById("fetch-next");
const topicInput = document.getElementById("topic-input");
const stateImpact = new Map();
const agentStreamEntries = new Map();
const agentEntryAnimators = new WeakMap();
let debateLoadingNote = null;
let activeFeedCard = null;
let fetchLocked = false;
let pendingCouncilCardTimers = [];
let debateRunningTimer = null;
let councilsBooted = false;
const systemNoteQueue = [];
let systemNoteStreaming = false;
const deferredSystemNotesByRound = new Map();
let systemNotesContainer = null;
const systemRoundPending = new Map();
const pendingRoundBeginControls = new Set();
const analysisPendingRounds = new Set();
const analysisTimers = new Map();
const pendingRoundTabTimers = new Map();
const analysisStartDeferred = new Set();

const autoResizeTopicInput = () => {
  if (!topicInput) {
    return;
  }
  const maxHeight = 220;
  topicInput.style.height = "auto";
  const nextHeight = Math.min(topicInput.scrollHeight, maxHeight);
  topicInput.style.height = `${nextHeight}px`;
  topicInput.style.overflowY = topicInput.scrollHeight > maxHeight ? "auto" : "hidden";
};

const getFeedContainer = () => feedBody || feedList;

const updateFeedEmptyState = () => {
  if (!feedEmpty) {
    return;
  }
  const container = getFeedContainer();
  const hasCards = Boolean(container?.querySelector(".feed-card"));
  feedEmpty.style.display = hasCards ? "none" : "flex";
};

const isSystemNotePipelineIdle = () => !systemNoteStreaming && systemNoteQueue.length === 0;

const isRoundUiReadyToReveal = (roundId) => {
  if (roundId === null || roundId === undefined) {
    return false;
  }
  if (analysisPendingRounds.has(roundId)) {
    return false;
  }
  if ((systemRoundPending.get(roundId) || 0) > 0) {
    return false;
  }
  return isSystemNotePipelineIdle();
};

const flushDeferredRoundUi = () => {
  roundContainers.forEach((payload, roundId) => {
    if (!isRoundUiReadyToReveal(roundId)) {
      return;
    }

    if (payload?.tab) {
      payload.tab.classList.remove("pending");
      updateRoundTabMarkers();
    }

    const deferred = deferredSystemNotesByRound.get(roundId);
    if (Array.isArray(deferred) && deferred.length) {
      deferredSystemNotesByRound.delete(roundId);
      deferred.forEach((item) => {
        if (item?.message) {
          systemNoteQueue.push(item);
        }
      });
      processSystemNoteQueue();
      return;
    }

    if (pendingRoundBeginControls.has(roundId)) {
      pendingRoundBeginControls.delete(roundId);
      setRoundBeginControl(roundId);
    }
  });
};

const getGoToCurrentRoundTarget = () => {
  let target = null;
  roundContainers.forEach((entry, id) => {
    if (!entry?.tab || entry.tab.classList.contains("pending")) {
      return;
    }
    if (target === null || id > target) {
      target = id;
    }
  });
  return target;
};

function startAnalysisHold(id) {
  if (analysisTimers.has(id)) return;
  analysisPendingRounds.add(id);
  const payload = roundContainers.get(id) || ensureRoundContainer(id);
  if (payload?.tab) payload.tab.classList.add("pending");

  const timer = setTimeout(() => {
    analysisPendingRounds.delete(id);
    analysisTimers.delete(id);
    flushDeferredRoundUi();
    if (id === 0 && !councilsBooted) {
      setRoundBeginControl(0, { booting: true });
    } else if (id === 4) {
      setRoundBeginControl(id, { processing: true, processingMessage: "Preparing Verdict..." });
    } else {
      setRoundBeginControl(id, { showGoOnly: true });
    }
    flushDeferredRoundUi();
  }, 5000);

  analysisTimers.set(id, timer);
}
let agentsContainer = null;
let llmMessagesContainer = null;
let otherAgentsContainer = null;
let councilHeaderEl = null;
let councilOrchestratorCardEl = null;
let councilRoundViewsContainer = null;
let systemPanelContainer = null;
let councilPanelContainer = null;
let systemRoundTabsContainer = null;
let systemRoundControlsContainer = null;
let systemRoundViewsContainer = null;
let systemGeneralMessagesContainer = null;
let systemMessagesScrollContainer = null;
let activeSystemRound = null;
let currentSystemRound = null;
let compactModeBtn = null;
const roundContainers = new Map();
const councilRoundContainers = new Map();
const roundTabLabels = new Map();

const getRoundTabLabel = (roundId) => roundTabLabels.get(roundId) || `View round ${roundId}`;

const getAgentCardKey = (payload = {}) => {
  const name = payload.agent || "Council";
  const roundId = normalizeRoundId(payload.round);
  return `${roundId === null ? "x" : roundId}:${name}`;
};

const animateAgentEntryText = (entry, text, options = {}) => {
  if (!entry) {
    return;
  }
  const nextText = String(text || "");
  const flush = Boolean(options.flush);

  let state = agentEntryAnimators.get(entry);
  if (!state) {
    state = {
      shown: "",
      target: "",
      timer: null,
    };
    agentEntryAnimators.set(entry, state);
  }

  state.target = nextText;

  if (flush) {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    state.shown = state.target;
    entry.textContent = state.target;
    return;
  }

  if (!state.shown || state.shown !== entry.textContent || state.shown.length > state.target.length || !state.target.startsWith(state.shown)) {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    state.shown = "";
    entry.innerHTML = "";
    entry.textContent = "";
  }

  if (state.timer) {
    return;
  }

  const step = () => {
    if (state.shown === state.target) {
      if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
      }
      return;
    }

    const remaining = state.target.length - state.shown.length;
    const chunk = Math.min(6, Math.max(1, Math.ceil(remaining / 8)));
    state.shown = state.target.slice(0, state.shown.length + chunk);
    entry.textContent = state.shown;
  };

  step();
  state.timer = setInterval(step, 18);
};

const setFeedCollapsed = (collapsed) => {
  if (!layoutElement || !feedList) {
    return;
  }
  layoutElement.classList.toggle("feed-collapsed", Boolean(collapsed));
  const toggleBtn = feedList.querySelector(".feed-collapse-btn");
  if (toggleBtn) {
    toggleBtn.classList.toggle("is-collapsed", Boolean(collapsed));
    toggleBtn.classList.toggle("is-expanded", !collapsed);
    toggleBtn.setAttribute("aria-label", collapsed ? "Expand feed panel" : "Collapse feed panel");
    toggleBtn.setAttribute("title", collapsed ? "Expand feed panel" : "Collapse feed panel");
  }
  setTimeout(() => {
    try {
      map.invalidateSize();
    } catch (e) {
    }
  }, 120);
};

const setCompactMode = (enabled) => {
  if (!layoutElement) {
    return;
  }
  layoutElement.classList.toggle("compact-mode", Boolean(enabled));
  try {
    document.body.classList.toggle("compact-mode", Boolean(enabled));
  } catch (e) {
  }

  if (enabled) {
    layoutElement.classList.remove("feed-collapsed");
  }
  if (compactModeBtn) {
    compactModeBtn.textContent = enabled ? "Full View" : "Compact View";
  }
  setTimeout(() => {
    try {
      map.invalidateSize();
    } catch (e) {
    }
  }, 120);
};

const initCompactModeToggle = () => {
  const compactContainer = topbarRight || statusStrip;
  if (!compactContainer || !layoutElement || compactContainer.querySelector(".compact-mode-btn")) {
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "status-item compact-mode-btn";
  button.textContent = "Compact View";
  button.setAttribute("aria-label", "Switch to compact mode");
  button.addEventListener("click", () => {
    const enabled = layoutElement.classList.contains("compact-mode");
    setCompactMode(!enabled);
  });
  compactContainer.appendChild(button);
  compactModeBtn = button;
};

const initFeedCollapseToggle = () => {
  if (!feedList || !layoutElement || feedList.querySelector(".feed-collapse-btn")) {
    return;
  }
  const actions = document.getElementById("feed-actions");
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "feed-collapse-btn";
  toggleBtn.setAttribute("aria-label", "Collapse feed panel");
  toggleBtn.setAttribute("title", "Collapse feed panel");
  toggleBtn.addEventListener("click", () => {
    const collapsed = layoutElement.classList.contains("feed-collapsed");
    setFeedCollapsed(!collapsed);
  });
  if (actions) {
    actions.prepend(toggleBtn);
  } else {
    feedList.appendChild(toggleBtn);
  }
  setFeedCollapsed(layoutElement.classList.contains("feed-collapsed"));
};

const stopDebateRunningIndicator = () => {
  if (debateRunningTimer) {
    clearInterval(debateRunningTimer);
    debateRunningTimer = null;
  }
};

const startDebateRunningIndicator = () => {
  if (!fetchNextBtn) {
    return;
  }
  stopDebateRunningIndicator();
  let frame = 1;
  const render = () => {
    const dots = ".".repeat(frame);
    fetchNextBtn.textContent = `Simulation running${dots}`;
    frame = frame >= 3 ? 1 : frame + 1;
  };
  render();
  debateRunningTimer = setInterval(render, 420);
};

const updateCouncilEmptyState = () => {
  if (!councilOrchestratorCardEl) {
    return;
  }
  let messageCount = 0;
  councilRoundContainers.forEach((entry) => {
    messageCount += (entry.llm?.children?.length || 0) + (entry.others?.children?.length || 0);
  });
  const hasMessages = messageCount > 0;
  const waitingVisible = councilOrchestratorCardEl.classList.contains("waiting");
  councilOrchestratorCardEl.style.display = waitingVisible || (!hasMessages && !fetchLocked) ? "grid" : "none";
};

const setDebateLocked = (locked) => {
  try {
    document.body.classList.toggle("debate-locked", Boolean(locked));
  } catch (e) {
  }
  fetchLocked = Boolean(locked);
  try {
    if (topicInput) {
      topicInput.disabled = Boolean(locked);
      if (locked) {
        topicInput.blur();
        topicInput.setAttribute("aria-disabled", "true");
      } else {
        topicInput.removeAttribute("aria-disabled");
      }
    }
  } catch (e) {
  }
  updateCouncilEmptyState();
};

document.addEventListener(
  "click",
  (e) => {
    if (!fetchLocked) return;
    const el = e.target;
    if (el.closest && (el.closest("#fetch-next") || el.closest("#topic-text") || el.closest(".topic-pill"))) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true
);

const isNearTop = (element, threshold = 80) => {
  if (!element) {
    return true;
  }
  return element.scrollTop <= threshold;
};

const scrollToTop = (element) => {
  if (!element) {
    return;
  }
  element.scrollTop = 0;
};

initFeedCollapseToggle();
initCompactModeToggle();
updateFeedEmptyState();
autoResizeTopicInput();
topicInput?.addEventListener("input", autoResizeTopicInput);

const ensureDeliberationPanels = () => {
  if (
    systemPanelContainer &&
    councilPanelContainer &&
    systemPanelContainer.parentElement === deliberationList &&
    councilPanelContainer.parentElement === deliberationList
  ) {
    return;
  }
  deliberationList.innerHTML = "";

  const top = document.createElement("div");
  top.className = "chat-pane chat-pane-system";

  const bottom = document.createElement("div");
  bottom.className = "chat-pane chat-pane-council";

  deliberationList.appendChild(top);
  deliberationList.appendChild(bottom);

  systemPanelContainer = top;
  councilPanelContainer = bottom;
};

const syncGoToCurrentRoundControl = () => {
  if (!systemRoundControlsContainer) {
    return;
  }

  const existing = systemRoundControlsContainer.querySelector(".go-current-round-btn");
  const targetRound = getGoToCurrentRoundTarget();
  const shouldShow = targetRound !== null && targetRound > 0 && activeSystemRound !== targetRound;

  if (!shouldShow) {
    existing?.remove();
    return;
  }

  if (existing) {
    existing.classList.remove("disabled");
    existing.disabled = false;
    return;
  }

  const goCurrentBtn = document.createElement("button");
  goCurrentBtn.className = "begin-round-btn go-current-round-btn";
  goCurrentBtn.textContent = "Go to current round";
  goCurrentBtn.addEventListener("click", () => {
    const target = getGoToCurrentRoundTarget();
    if (target === null) {
      return;
    }
    setActiveRound(target);
    goCurrentBtn.remove();
  });
  systemRoundControlsContainer.appendChild(goCurrentBtn);
};

const setActiveSystemRound = (roundId) => {
  roundContainers.forEach((entry, id) => {
    if (entry.view) {
      entry.view.classList.toggle("active", id === roundId);
    }
    if (entry.tab) {
      entry.tab.classList.toggle("active", id === roundId);
    }
  });
  if (systemGeneralMessagesContainer) {
    systemGeneralMessagesContainer.style.display = roundId === null ? "flex" : "none";
  }
  activeSystemRound = roundId;
  updateRoundTabMarkers();
  syncGoToCurrentRoundControl();

  const roundLabel = (roundId !== null && roundTabLabels.get(roundId)) || "";
  const isVerdict = String(roundLabel).trim().toLowerCase() === "verdict";

  if (isVerdict && councilOrchestratorCardEl) {
    let messageCount = 0;
    councilRoundContainers.forEach((entry) => {
      messageCount += (entry.llm?.children?.length || 0) + (entry.others?.children?.length || 0);
    });

    const orchestratorVisible = messageCount === 0 && !fetchLocked;
    if (orchestratorVisible) {
      const speechList = councilOrchestratorCardEl.querySelector(".agent-speech-list");
      if (speechList) {
        let entry = speechList.querySelector(".agent-speech");
        if (!entry) {
          entry = document.createElement("div");
          entry.className = "agent-speech";
          speechList.appendChild(entry);
        }
        entry.classList.remove("loading");
        entry.textContent = "The simulation is finished";
        councilOrchestratorCardEl.classList.remove("waiting");
        councilOrchestratorCardEl.classList.remove("muted");
        updateCouncilEmptyState();
      }
      return;
    }
  }

  if (!isVerdict && councilOrchestratorCardEl) {
    const speechList = councilOrchestratorCardEl.querySelector(".agent-speech-list");
    const entry = speechList?.querySelector(".agent-speech");
    if (entry && entry.textContent === "The simulation is finished") {
      entry.textContent = "Begin a simulation to see the council's responses.";
      entry.classList.remove("loading");
      updateCouncilEmptyState();
    }
  }
};

const updateRoundTabMarkers = () => {
  roundContainers.forEach((entry, id) => {
    if (!entry.tab) {
      return;
    }
    const isCurrent = currentSystemRound === id;
    const baseLabel = getRoundTabLabel(id);
    entry.tab.classList.toggle("current", isCurrent);
    entry.tab.textContent = isCurrent ? `${baseLabel} • Current` : baseLabel;
  });
};

const setActiveCouncilRound = (roundId) => {
  councilRoundContainers.forEach((entry, id) => {
    if (entry.view) {
      entry.view.classList.toggle("active", id === roundId);
    }
  });
};

const setActiveRound = (roundId) => {
  setActiveSystemRound(roundId);
  setActiveCouncilRound(roundId);
};

const addCompletedRoundTab = (roundId) => {
  const round = roundContainers.get(roundId);
  if (!round || round.tab || !systemRoundTabsContainer) {
    return;
  }
  const tab = document.createElement("button");
  tab.className = "system-round-tab";
  tab.textContent = getRoundTabLabel(roundId);
  tab.addEventListener("click", () => {
    setActiveRound(roundId);
  });
  systemRoundTabsContainer.appendChild(tab);
  round.tab = tab;
  updateRoundTabMarkers();
};

const ensureRoundContainer = (round) => {
  const roundId = normalizeRoundId(round);
  if (roundId === null) {
    return null;
  }
  ensureSystemNotesContainer();
  if (roundContainers.has(roundId)) {
    return roundContainers.get(roundId);
  }

  const view = document.createElement("div");
  view.className = "system-round-view";
  view.dataset.round = String(roundId);
  systemRoundViewsContainer.appendChild(view);

  const payload = { roundId, view, tab: null };
  if (systemRoundTabsContainer) {
    const tab = document.createElement("button");
    tab.className = "system-round-tab";
    tab.textContent = getRoundTabLabel(roundId);
    tab.addEventListener("click", () => {
      setActiveRound(roundId);
    });
    systemRoundTabsContainer.appendChild(tab);
    payload.tab = tab;
  }
  roundContainers.set(roundId, payload);
  updateRoundTabMarkers();
  return payload;
};

const ensureCouncilRoundContainer = (round) => {
  const roundId = normalizeRoundId(round);
  if (roundId === null) {
    return null;
  }
  ensureAgentsContainer();
  if (councilRoundContainers.has(roundId)) {
    return councilRoundContainers.get(roundId);
  }

  const view = document.createElement("div");
  view.className = "council-round-view";
  view.dataset.round = String(roundId);

  const llm = document.createElement("div");
  llm.className = "llm-messages";
  const others = document.createElement("div");
  others.className = "other-agents";

  view.appendChild(llm);
  view.appendChild(others);
  councilRoundViewsContainer?.appendChild(view);

  const payload = { roundId, view, llm, others };
  councilRoundContainers.set(roundId, payload);
  return payload;
};

const setRoundBeginControl = (roundId, options = {}) => {
  ensureSystemNotesContainer();
  if (!systemRoundControlsContainer) {
    return;
  }
  systemRoundControlsContainer.innerHTML = "";
  if (roundId === null || roundId === undefined) {
    return;
  }

  const goTargetRound = getGoToCurrentRoundTarget();
  const canShowGoToCurrentRound =
    goTargetRound !== null &&
    goTargetRound > 0 &&
    activeSystemRound !== goTargetRound;

  const appendGoToCurrentRoundButton = () => {
    if (!canShowGoToCurrentRound) {
      return;
    }
    const goCurrentBtn = document.createElement("button");
    goCurrentBtn.className = "begin-round-btn go-current-round-btn";
    goCurrentBtn.textContent = "Go to current round";
    goCurrentBtn.addEventListener("click", () => {
      const targetRound = getGoToCurrentRoundTarget();
      if (targetRound === null) {
        return;
      }
      setActiveRound(targetRound);
      goCurrentBtn.remove();
    });
    systemRoundControlsContainer.appendChild(goCurrentBtn);
  };

  if (options.showGoOnly) {
    if (roundId > 0) setOrchestratorWaiting(true);
    appendGoToCurrentRoundButton();
    return;
  }

  if (options.processing) {
    const processingBtn = document.createElement("button");
    processingBtn.className = "begin-round-btn is-loading processing";
    processingBtn.disabled = true;
    processingBtn.classList.add("disabled");
    processingBtn.textContent = options.processingMessage || "Processing...";
    systemRoundControlsContainer.appendChild(processingBtn);
    appendGoToCurrentRoundButton();
    return;
  }

  const btn = document.createElement("button");
  btn.className = "begin-round-btn";
  const isBooting = Boolean(options.booting);
  if (isBooting) {
    btn.disabled = true;
    btn.classList.add("disabled");
    btn.textContent = "Councils are booting...";
    systemRoundControlsContainer.appendChild(btn);
    appendGoToCurrentRoundButton();
    return;
  }
  btn.textContent = `Begin round ${roundId}`;
  btn.addEventListener("click", async () => {
    setActiveRound(roundId);
    if (roundId > 0) setOrchestratorWaiting(false);
    systemRoundControlsContainer.innerHTML = "";
    const processingBtn = document.createElement("button");
    processingBtn.className = "begin-round-btn is-loading processing";
    processingBtn.disabled = true;
    processingBtn.classList.add("disabled");
    processingBtn.textContent = "Processing...";
    systemRoundControlsContainer.appendChild(processingBtn);
    if (roundId === 0 && fetchNextBtn) {
      startDebateRunningIndicator();
      fetchNextBtn.classList.remove("is-loading");
      fetchNextBtn.disabled = true;
    }
    try {
      await fetch(`/api/round/begin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ round: roundId }),
      });
    } catch (e) {
    }
  });

  systemRoundControlsContainer.appendChild(btn);
  if (roundId > 0) setOrchestratorWaiting(true);

  appendGoToCurrentRoundButton();
};

const ensureSystemNotesContainer = () => {
  ensureDeliberationPanels();
  if (systemNotesContainer && systemNotesContainer.parentElement === systemPanelContainer) {
    return systemNotesContainer;
  }

  const container = document.createElement("div");
  container.className = "system-notes";

  const header = document.createElement("div");
  header.className = "section-header";
  header.textContent = "System Messages";

  const headerRow = document.createElement("div");
  headerRow.className = "system-header-row";

  const tabs = document.createElement("div");
  tabs.className = "system-round-tabs";

  const controls = document.createElement("div");
  controls.className = "system-round-controls";

  const general = document.createElement("div");
  general.className = "system-general-messages";

  const views = document.createElement("div");
  views.className = "system-round-views";

  const messagesScroll = document.createElement("div");
  messagesScroll.className = "system-messages-scroll";

  headerRow.appendChild(header);
  headerRow.appendChild(controls);
  messagesScroll.appendChild(general);
  messagesScroll.appendChild(views);

  container.appendChild(headerRow);
  container.appendChild(tabs);
  container.appendChild(messagesScroll);

  systemPanelContainer.appendChild(container);

  systemNotesContainer = container;
  systemRoundTabsContainer = tabs;
  systemRoundControlsContainer = controls;
  systemGeneralMessagesContainer = general;
  systemRoundViewsContainer = views;
  systemMessagesScrollContainer = messagesScroll;

  return container;
};

const ensureAgentsContainer = () => {
  ensureDeliberationPanels();
  if (agentsContainer && agentsContainer.parentElement === councilPanelContainer) {
    return agentsContainer;
  }
  const container = document.createElement("div");
  container.className = "agent-list council-box";
  const header = document.createElement("div");
  header.className = "section-header";
  header.textContent = "Council's messages";
  container.appendChild(header);

  const orchestrator = createAgentCard({
    name: "Council Orchestrator",
    message: "",
  });
  orchestrator.classList.add("council-orchestrator");
  orchestrator.classList.add("system");
  container.appendChild(orchestrator);
  streamCardMessage(orchestrator, "Begin a simulation to see the council's responses.", {
    speed: 50,
  });

  const views = document.createElement("div");
  views.className = "council-round-views";
  container.appendChild(views);

  councilPanelContainer.appendChild(container);

  agentsContainer = container;
  llmMessagesContainer = null;
  otherAgentsContainer = null;
  councilHeaderEl = header;
  councilOrchestratorCardEl = orchestrator;
  councilRoundViewsContainer = views;
  updateCouncilEmptyState();
  return container;
};

const resetCouncilRoundWindow = () => {
  pendingCouncilCardTimers.forEach((timer) => clearTimeout(timer));
  pendingCouncilCardTimers = [];
  agentCards.clear();
  agentStreamEntries.clear();
  councilRoundContainers.forEach((entry) => {
    entry.llm.innerHTML = "";
    entry.others.innerHTML = "";
  });
  councilRoundContainers.clear();
  updateCouncilEmptyState();
};

const normalizeRoundId = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
};

const insertAgentCard = (card, round) => {
  ensureAgentsContainer();
  const roundId = normalizeRoundId(round);
  const target = roundId !== null ? ensureCouncilRoundContainer(roundId) : null;
  const agentName = card.dataset.agentName || "";
  if (agentName && agentName.toLowerCase() === "llm") {
    if (target?.llm) target.llm.appendChild(card);
    else if (llmMessagesContainer) llmMessagesContainer.appendChild(card);
    else agentsContainer.appendChild(card);
  } else {
    if (target?.others) target.others.appendChild(card);
    else if (otherAgentsContainer) otherAgentsContainer.appendChild(card);
    else agentsContainer.appendChild(card);
  }
  updateCouncilEmptyState();
};

const STATE_AVATAR_STYLES = {
  "Tamil Nadu": { initials: "TN", background: "#7dd3fc" },
  Delhi: { initials: "DL", background: "#fcd34d" },
  Kerala: { initials: "KL", background: "#6ee7b7" },
  Assam: { initials: "AS", background: "#fca5a5" },
  Punjab: { initials: "PB", background: "#c4b5fd" },
  Karnataka: { initials: "KA", background: "#93c5fd" },
  Maharashtra: { initials: "MH", background: "#fda4af" },
  "Uttar Pradesh": { initials: "UP", background: "#fdba74" },
  "West Bengal": { initials: "WB", background: "#a5b4fc" },
  Gujarat: { initials: "GJ", background: "#fca5a5" },
};

const STATE_TEAMS = {
  "Tamil Nadu": "dmk",
  Delhi: "aap",
  Punjab: "aap",
  Kerala: "cpim",
  Assam: "bjp",
  Karnataka: "congress",
  Maharashtra: "bjp",
  "Uttar Pradesh": "bjp",
  "West Bengal": "tmc",
  Gujarat: "bjp",
};

const getStateTeam = (stateName) => STATE_TEAMS[stateName] || "independent";

const getStateInitials = (stateName) => {
  const trimmed = (stateName || "").trim();
  if (!trimmed) {
    return "";
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
};

const getStateAvatar = (stateName) => {
  const style = STATE_AVATAR_STYLES[stateName];
  if (style) {
    return style;
  }
  return {
    initials: getStateInitials(stateName),
    background: "#d4d4d4",
  };
};

const setStatusText = (el, value) => {
  if (!el || !value) {
    return;
  }
  el.textContent = value;
};

const setTopic = (title) => {
  if (!topicText) {
    return;
  }
  topicText.textContent = title;
};

const formatMeta = (source, publishedAt) => {
  const label = source || "Unknown";
  const time = publishedAt ? new Date(publishedAt).toLocaleTimeString() : "now";
  return `${label} • ${time}`;
};

const getStorySummary = (story) => {
  if (!story) {
    return "Policy summary";
  }
  return story.summary || story.title || "Policy summary";
};

const clearActiveFeed = () => {
  const container = getFeedContainer();
  container?.querySelectorAll(".feed-card.active").forEach((card) => {
    card.classList.remove("active");
    const badge = card.querySelector(".badge");
    if (badge) {
      badge.textContent = "Pending";
      badge.classList.add("muted");
    }
  });
};

const addFeedCard = (story, isActive) => {
  const card = document.createElement("div");
  card.className = `feed-card${isActive ? " active" : ""}`;
  const badgeLabel = isActive ? "Active" : "Pending";
  const badgeClass = isActive ? "badge" : "badge muted";

  card.innerHTML = `
    <div class="feed-card__header">
      <span class="${badgeClass}">${badgeLabel}</span>
    </div>
    <h3>${getStorySummary(story)}</h3>
    <p>${formatMeta(story.source, story.publishedAt)}</p>
  `;

  const container = getFeedContainer();
  container?.prepend(card);
  updateFeedEmptyState();
  return card;
};

const createActiveFeedCard = (story) => {
  const card = document.createElement("div");
  card.className = "feed-card active processing";
  card.id = "active-feed-card";
  card.innerHTML = `
    <div class="feed-card__header">
      <span class="badge processing">Processing</span>
    </div>
    <h3>${getStorySummary(story)}</h3>
    <p>${formatMeta(story.source, story.publishedAt)}</p>
  `;
  return card;
};


const setActiveFeed = (story) => {
  let card = document.getElementById("active-feed-card");
  if (!card) {
    const activeCard = createActiveFeedCard(story);
    const container = getFeedContainer();
    container?.prepend(activeCard);
    card = activeCard;
  }
  const header = card.querySelector("h3");
  const meta = card.querySelector("p");
  if (header) {
    header.textContent = getStorySummary(story);
  }
  if (meta) {
    meta.textContent = formatMeta(story.source, story.publishedAt);
  }

  const badge = card.querySelector(".badge");
  if (badge) {
    badge.textContent = "Processing";
    badge.classList.remove("muted");
    badge.classList.add("processing");
  }

  card.classList.add("active", "processing");
  card.id = "active-feed-card";
  activeFeedCard = card;
  updateFeedEmptyState();

  card.style.cursor = "default";
};

const setActiveState = (stateName) => {
  const normalized = normalizeStateName(stateName);
  stateLayer.eachLayer((layer) => {
    const element = layer.getElement();
    if (element?.classList.contains("active")) {
      const currentName = normalizeStateName(element.__stateName || "");
      const currentImpact = stateImpact.get(currentName);
      const targets = getStateLayers(currentName);
      targets.forEach((l) => {
        if (currentImpact === "positive") {
          l.setStyle(positiveStateStyle);
        } else if (currentImpact === "negative") {
          l.setStyle(negativeStateStyle);
        } else {
          l.setStyle(baseStateStyle);
        }
      });
      element.classList.remove("active");
    }
  });

  const targets = getStateLayers(normalized);
  targets.forEach((layer) => {
    const element = layer.getElement();
    if (element) {
      element.__stateName = stateName;
      element.classList.add("active");
    }
    layer.setStyle(activeStateStyle);
  });
};

const setStateImpact = (stateName, impact) => {
  const normalized = normalizeStateName(stateName);
  console.log(`[MAP] Setting ${impact} impact for "${stateName}" -> normalized: "${normalized}"`);
  stateImpact.set(normalized, impact);
  const targets = getStateLayers(normalized);
  console.log(`[MAP] Found ${targets.length} layer(s) for "${normalized}"`);
  targets.forEach((layer) => {
    if (impact === "positive") {
      layer.setStyle(positiveStateStyle);
    } else if (impact === "negative") {
      layer.setStyle(negativeStateStyle);
    } else {
      layer.setStyle(baseStateStyle);
    }
  });
};

const createAgentCard = (agent) => {
  const card = document.createElement("div");
  card.className = "agent-card";
  card.dataset.agentName = agent?.name || "Council";
  if (agent?.name === "System") {
    card.classList.add("system");
  }
  if (agent?.state) {
    card.classList.add(`team-${getStateTeam(agent.state)}`);
  }
  const avatarClass = agent?.muted ? "agent-avatar ghost" : "agent-avatar";
  const role = agent?.state ? `<span>${agent.state}</span>` : "";
  const avatarData = agent?.state ? getStateAvatar(agent.state) : null;
  const avatarLabel = avatarData?.initials || "";
  const avatarStyle = avatarData?.background ? `style="background:${avatarData.background};"` : "";
  const messageText = agent?.message ?? "Awaiting signal.";
  const hasMessage = Boolean(String(messageText).trim());
  card.innerHTML = `
    <div class="${avatarClass}" ${avatarStyle}>${avatarLabel}</div>
    <div>
      <div class="agent-name">${agent.name || "Council"} ${role}</div>
      <div class="agent-speech-list">
        ${hasMessage ? `<div class="agent-speech">${messageText}</div>` : ""}
      </div>
    </div>
  `;
  return card;
};

const createBootingCard = () => {
  const card = document.createElement("div");
  card.className = "agent-card muted";
  card.id = "booting-card";
  card.innerHTML = `
    <div class="agent-avatar"></div>
    <div>
      <div class="agent-name">Council booting...</div>
      <div class="agent-speech-list">
        <div class="agent-speech">Waiting for simulation signal.</div>
      </div>
    </div>
  `;
  return card;
};

const markCouncilBooted = () => {
  const booting = document.getElementById("booting-card");
  councilsBooted = true;
  if (!booting) {
    if (currentSystemRound === 0) {
      setRoundBeginControl(0);
    }
    return;
  }
  const nameEl = booting.querySelector(".agent-name");
  const speechEl = booting.querySelector(".agent-speech");
  if (nameEl) {
    nameEl.textContent = "Council booted..";
  }
  if (speechEl) {
    speechEl.textContent = "All councils loaded and ready.";
  }
  if (currentSystemRound === 0) {
    setRoundBeginControl(0);
  }
};

const removeBootingCard = () => {
  const booting = document.getElementById("booting-card");
  if (booting) {
    booting.remove();
  }
};

const removeStandingBy = (card) => {
  if (!card) {
    return;
  }
  const speechList = card.querySelector(".agent-speech-list");
  if (!speechList) {
    return;
  }
  const entries = Array.from(speechList.querySelectorAll(".agent-speech"));
  entries.forEach((entry) => {
    const text = (entry.textContent || "").trim().toLowerCase();
    if (text === "standing by..." || text === "awaiting signal.") {
      entry.remove();
    }
  });
};


const resetCouncil = (agents = []) => {
  deliberationList.innerHTML = "";
  councilsBooted = true;
  agentCards.clear();
  agentStreamEntries.clear();
  systemNotesContainer = null;
  agentsContainer = null;
  llmMessagesContainer = null;
  otherAgentsContainer = null;
  councilHeaderEl = null;
  councilOrchestratorCardEl = null;
  councilRoundViewsContainer = null;
  systemPanelContainer = null;
  councilPanelContainer = null;
  systemRoundTabsContainer = null;
  systemRoundControlsContainer = null;
  systemRoundViewsContainer = null;
  systemGeneralMessagesContainer = null;
  systemMessagesScrollContainer = null;
  activeSystemRound = null;
  currentSystemRound = null;
  roundContainers.clear();
  councilRoundContainers.clear();
  roundTabLabels.clear();
  ensureSystemNotesContainer();
  ensureAgentsContainer();
  updateCouncilEmptyState();
  agents.forEach((agent) => {
    const card = createAgentCard({
      name: agent.name,
      state: agent.state,
      message: "Standing by...",
      muted: true,
    });
    const key = `0:${agent.name}`;
    agentCards.set(key, card);
    insertAgentCard(card, 0);
  });
};

const resetCouncilDelayed = (agents = [], delayMs = 2000) => {
  deliberationList.innerHTML = "";
  councilsBooted = false;
  agentCards.clear();
  agentStreamEntries.clear();
  pendingCouncilCardTimers.forEach((timer) => clearTimeout(timer));
  pendingCouncilCardTimers = [];
  systemNotesContainer = null;
  agentsContainer = null;
  llmMessagesContainer = null;
  otherAgentsContainer = null;
  councilHeaderEl = null;
  councilOrchestratorCardEl = null;
  councilRoundViewsContainer = null;
  systemPanelContainer = null;
  councilPanelContainer = null;
  systemRoundTabsContainer = null;
  systemRoundControlsContainer = null;
  systemRoundViewsContainer = null;
  systemGeneralMessagesContainer = null;
  systemMessagesScrollContainer = null;
  activeSystemRound = null;
  currentSystemRound = null;
  roundContainers.clear();
  councilRoundContainers.clear();
  roundTabLabels.clear();
  ensureSystemNotesContainer();
  ensureAgentsContainer();
  updateCouncilEmptyState();
  insertAgentCard(createBootingCard(), 0);
  let loadedCount = 0;
  if (!agents.length) {
    markCouncilBooted();
  }
  agents.forEach((agent, index) => {
    const timer = setTimeout(() => {
      if (agentCards.has(`0:${agent.name}`)) {
        return;
      }
      const card = createAgentCard({
        name: agent.name,
        state: agent.state,
        message: "Standing by...",
        muted: true,
      });
      const key = `0:${agent.name}`;
      agentCards.set(key, card);
      insertAgentCard(card, 0);
      loadedCount += 1;
      if (loadedCount >= agents.length) {
        markCouncilBooted();
      }
    }, delayMs * (index + 1));
    pendingCouncilCardTimers.push(timer);
  });
};

const upsertAgentStreamMessage = (payload) => {
  const name = payload.agent || "Council";
  const roundId = normalizeRoundId(payload.round);
  const cardKey = getAgentCardKey(payload);
  agentCards.forEach((existing) => existing.classList.remove("speaking"));
  let card = agentCards.get(cardKey);
  if (!card) {
    card = createAgentCard({ name, state: payload.state, message: "" });
    agentCards.set(cardKey, card);
    insertAgentCard(card, roundId);
  }
  removeBootingCard();
  removeStandingBy(card);

  const speechList = card.querySelector(".agent-speech-list");
  const nameEl = card.querySelector(".agent-name");
  const avatarEl = card.querySelector(".agent-avatar");
  const label = payload.label || "";
  const roundLabel = label ? `${label}: ` : "";
  const streamKey = `${name}:${payload.round ?? ""}:${label}`;
  const hasMessage = Boolean(payload.message && payload.message.trim());

  if (speechList) {
    let entry = agentStreamEntries.get(streamKey);
    if (!entry) {
      const loadingEntry = speechList.querySelector(".agent-speech.loading");
      if (loadingEntry) {
        entry = loadingEntry;
      } else {
        entry = document.createElement("div");
        entry.className = "agent-speech";
        speechList.appendChild(entry);
      }
      if (label) {
        entry.classList.add(`speech-${label.toLowerCase().replace(/\s+/g, "-")}`);
      }
      agentStreamEntries.set(streamKey, entry);
    }

    if (hasMessage) {
      removeStandingBy(card);
      entry.classList.remove("loading");
      speechList.querySelectorAll(".agent-speech.loading").forEach((el) => {
        if (el !== entry) el.remove();
      });
      animateAgentEntryText(entry, `${roundLabel}${payload.message || ""}`);
    } else if (!entry.textContent || entry.classList.contains("loading")) {
      entry.classList.add("loading");
      entry.innerHTML = `<span class="thinking-text">Council member is thinking</span><span class="thinking-dots"><span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></span>`;
    }
  }

  if (nameEl && payload.state) {
    nameEl.innerHTML = `${name} <span>${payload.state}</span>`;
  }
  if (avatarEl && payload.state) {
    const avatarData = getStateAvatar(payload.state);
    avatarEl.textContent = avatarData.initials;
    avatarEl.style.background = avatarData.background;
  }
  if (payload.state) {
    card.classList.add(`team-${getStateTeam(payload.state)}`);
  }
  card.classList.remove("muted");
  card.classList.add("speaking");
  if (payload.state) {
    setActiveState(payload.state);
  }
  if (isNearTop(deliberationList)) {
    scrollToTop(deliberationList);
  }
};

const upsertAgentMessage = (payload) => {
  const name = payload.agent || "Council";
  const roundId = normalizeRoundId(payload.round);
  const cardKey = getAgentCardKey(payload);
  agentCards.forEach((existing) => existing.classList.remove("speaking"));
  let card = agentCards.get(cardKey);
  if (!card) {
    card = createAgentCard({ name, state: payload.state, message: "" });
    agentCards.set(cardKey, card);
    insertAgentCard(card, roundId);
  }

  const speechList = card.querySelector(".agent-speech-list");
  const nameEl = card.querySelector(".agent-name");
  const avatarEl = card.querySelector(".agent-avatar");
  if (speechList) {
    const label = payload.label || "";
    const roundLabel = label ? `${label}: ` : "";
    const streamKey = `${name}:${payload.round ?? ""}:${label}`;
    let entry = agentStreamEntries.get(streamKey);
    if (!entry) {
      const loadingEntry = speechList.querySelector(".agent-speech.loading");
      if (loadingEntry) {
        entry = loadingEntry;
      } else {
        entry = document.createElement("div");
        entry.className = "agent-speech";
        speechList.appendChild(entry);
      }
      if (label) {
        entry.classList.add(`speech-${label.toLowerCase().replace(/\s+/g, "-")}`);
      }
      agentStreamEntries.set(streamKey, entry);
    }
    entry.classList.remove("loading");
    speechList.querySelectorAll(".agent-speech.loading").forEach((el) => {
      if (el !== entry) el.remove();
    });
    animateAgentEntryText(entry, `${roundLabel}${payload.message || ""}`);
  }
  if (nameEl && payload.state) {
    nameEl.innerHTML = `${name} <span>${payload.state}</span>`;
  }
  if (avatarEl && payload.state) {
    const avatarData = getStateAvatar(payload.state);
    avatarEl.textContent = avatarData.initials;
    avatarEl.style.background = avatarData.background;
  }
  if (payload.state) {
    card.classList.add(`team-${getStateTeam(payload.state)}`);
  }
  card.classList.remove("muted");

  removeBootingCard();
  removeStandingBy(card);

  card.classList.add("speaking");
  if (payload.state) {
    setActiveState(payload.state);
  }
  if (isNearTop(deliberationList)) {
    scrollToTop(deliberationList);
  }
};

const addSystemNote = (message, options = {}) => {
  const note = createAgentCard({ name: "System", message, muted: true });
  const speechList = note.querySelector(".agent-speech-list");
  const isLoading = Boolean(options.loading);
  if (speechList && message?.includes("\n")) {
    speechList.innerHTML = "";
    message.split("\n").forEach((line, index) => {
      const entry = document.createElement("div");
      entry.className = "agent-speech";
      if (isLoading && index === 0) {
        entry.classList.add("loading");
      }
      entry.textContent = line;
      speechList.appendChild(entry);
    });
  } else if (speechList) {
    const entry = speechList.querySelector(".agent-speech");
    if (entry && isLoading) {
      entry.classList.add("loading");
    }
  }
  const roundId = normalizeRoundId(options.round);
  if (roundId !== null) {
    const round = ensureRoundContainer(roundId);
    round?.view.append(note);
    if (activeSystemRound === null) {
      setActiveRound(roundId);
    }
  } else {
    ensureSystemNotesContainer();
    systemGeneralMessagesContainer?.append(note);
  }
  scrollToTop(systemMessagesScrollContainer);
  return note;
};

const streamCardMessage = (card, message, options = {}) =>
  new Promise((resolve) => {
    const speechList = card?.querySelector(".agent-speech-list");
    const text = String(message || "");
    const lines = text.split("\n");
    const speed = Number.isFinite(options.speed) ? options.speed : 50;

    if (!speechList) {
      resolve(card);
      return;
    }

    speechList.innerHTML = "";

    if (!text.trim()) {
      resolve(card);
      return;
    }

    let lineIndex = 0;
    let charIndex = 0;
    let currentEntry = document.createElement("div");
    currentEntry.className = "agent-speech system-streaming";
    if (options.loading) {
      currentEntry.classList.add("loading");
    }
    speechList.appendChild(currentEntry);

    const scrollContainer = options.scrollContainer || null;
    let finished = false;
    let timer = null;

    const finishStream = () => {
      if (finished) {
        return;
      }
      finished = true;
      if (timer) {
        clearInterval(timer);
      }
      resolve(card);
    };

    const step = () => {
      const line = lines[lineIndex] || "";
      if (charIndex <= line.length) {
        currentEntry.textContent = line.slice(0, charIndex);
        charIndex += 1;
        if (scrollContainer) {
          scrollToTop(scrollContainer);
        }
        return;
      }

      currentEntry.classList.remove("system-streaming");
      lineIndex += 1;
      if (lineIndex >= lines.length) {
        finishStream();
        return;
      }

      charIndex = 0;
      currentEntry = document.createElement("div");
      currentEntry.className = "agent-speech system-streaming";
      if (options.loading) {
        currentEntry.classList.add("loading");
      }
      speechList.appendChild(currentEntry);
    };

    timer = setInterval(step, speed);
  });

const streamSystemNote = (message, options = {}) =>
  new Promise((resolve) => {
    const note = createAgentCard({ name: "System", message: "", muted: true });

    const roundId = normalizeRoundId(options.round);
    if (roundId !== null) {
      const round = ensureRoundContainer(roundId);
      round?.view.append(note);
      if (activeSystemRound === null) {
        setActiveRound(roundId);
      }
    } else {
      ensureSystemNotesContainer();
      systemGeneralMessagesContainer?.append(note);
    }
    streamCardMessage(note, message, {
      speed: 50,
      loading: Boolean(options.loading),
      scrollContainer: systemMessagesScrollContainer,
    }).then(() => {
      setSystemNoteLoading(note, false);
      resolve(note);
    });
  });

const processSystemNoteQueue = async () => {
  if (systemNoteStreaming) {
    return;
  }
  systemNoteStreaming = true;
  try {
    while (systemNoteQueue.length) {
      const item = systemNoteQueue.shift();
      if (!item || !item.message) {
        continue;
      }
      await streamSystemNote(item.message, item.options || {});

      const roundId = normalizeRoundId(item.options?.round);
      if (roundId !== null) {
        const prev = Math.max(0, systemRoundPending.get(roundId) || 0) - 1;
        systemRoundPending.set(roundId, prev);

        if (prev <= 0 && analysisStartDeferred.has(roundId)) {
          analysisStartDeferred.delete(roundId);
          startAnalysisHold(roundId);
        }

        if (prev <= 0) {
          flushDeferredRoundUi();
        }
      }

      flushDeferredRoundUi();
    }
  } finally {
    systemNoteStreaming = false;
    flushDeferredRoundUi();
  }
};
try {
  if (typeof window !== "undefined") {
    window.addSystemNote = addSystemNote;
  }
} catch (e) {
}

const safeAddNote = (message, options = {}) => {
  try {
    if (typeof window !== "undefined" && typeof window["addSystemNote"] === "function") {
      const roundId = normalizeRoundId(options?.round);
      if (roundId !== null && analysisPendingRounds.has(roundId)) {
        const bucket = deferredSystemNotesByRound.get(roundId) || [];
        bucket.push({ message, options });
        deferredSystemNotesByRound.set(roundId, bucket);
        return null;
      }
      if (options?.loading && !options?.stream) {
        return window["addSystemNote"](message, options);
      }
      systemNoteQueue.push({ message, options });
      processSystemNoteQueue();
      return null;
    }
  } catch (e) {
  }
  try {
    console.warn("[SYS NOTE]", message);
  } catch (e) {}
};

const setSystemNoteLoading = (note, isLoading, message) => {
  if (!note) {
    return;
  }
  const speechList = note.querySelector(".agent-speech-list");
  if (!speechList) {
    return;
  }
  const entry = speechList.querySelector(".agent-speech");
  if (!entry) {
    return;
  }
  entry.classList.toggle("loading", Boolean(isLoading));
  if (message) {
    if (isLoading) {
      entry.innerHTML = `<span class="thinking-text">${message.replace(/\.{3,}$/, "")}</span><span class="thinking-dots"><span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></span>`;
    } else {
      entry.textContent = message;
    }
  }
};

const setOrchestratorWaiting = (isWaiting, message = "Waiting for system instructions...") => {
  if (!councilOrchestratorCardEl) return;
  const speechList = councilOrchestratorCardEl.querySelector(".agent-speech-list");
  if (!speechList) return;
  let entry = speechList.querySelector(".agent-speech");
  if (!entry) {
    entry = document.createElement("div");
    entry.className = "agent-speech";
    speechList.appendChild(entry);
  }
  if (isWaiting) {
    councilOrchestratorCardEl.classList.add("waiting");
    entry.classList.add("loading");
    entry.innerHTML = `<span class="thinking-text">${message.replace(/\.{3,}$/, "")}</span><span class="thinking-dots"><span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span></span>`;
    councilOrchestratorCardEl.classList.remove("muted");
    updateCouncilEmptyState();
  } else {
    councilOrchestratorCardEl.classList.remove("waiting");
    entry.classList.remove("loading");
    if (!entry.textContent || /waiting for system instructions/i.test(entry.textContent)) {
      entry.textContent = "Standing by...";
    }
    updateCouncilEmptyState();
  }
};

const clearDebateLoading = (payload) => {
  if (!debateLoadingNote) {
    return;
  }
  const message = payload?.message?.trim();
  if (!message) {
    return;
  }
  setSystemNoteLoading(debateLoadingNote, false, "Simulation started.");
  debateLoadingNote = null;
};

const clearSystemLoadingIndicators = () => {
  if (!systemNotesContainer) {
    return;
  }
  const loadingEntries = systemNotesContainer.querySelectorAll(".agent-speech.loading");
  loadingEntries.forEach((entry) => entry.classList.remove("loading"));
};

const connectLiveStream = () => {
  if (!window.EventSource) {
    safeAddNote("Updates unsupported in this browser.");
    return;
  }

  const token = localStorage.getItem("llmCouncilIdToken");
  const streamUrl = token ? `/api/stream?token=${encodeURIComponent(token)}` : "/api/stream";
  const stream = new EventSource(streamUrl);
  stream.addEventListener("open", () => {
    setTopic("Connected. Awaiting update");
    setStatusText(statusConnection, "connected");
  });

  stream.addEventListener("topic", (event) => {
    const data = JSON.parse(event.data);
    setTopic(data.title || "Update");
  });

  stream.addEventListener("feed", (event) => {
    const data = JSON.parse(event.data);
    setActiveFeed(data);
  });

  stream.addEventListener("council_start", (event) => {
    const data = JSON.parse(event.data);
    stateLayer.eachLayer((layer) => {
      layer.getElement()?.classList.remove("active");
      layer.setStyle(baseStateStyle);
    });
    stateImpact.clear();
    resetCouncilDelayed(data.agents || [], 2000);
    if (councilHeaderEl) {
      councilHeaderEl.textContent = "Council's messages";
    }
    setRoundBeginControl(null);
    debateLoadingNote = safeAddNote("Beginning the simulation...", { loading: true });
    setDebateLocked(true);
  });

  stream.addEventListener("system", (event) => {
    const data = JSON.parse(event.data);
    if (data.message) {
      safeAddNote(data.message, {
        round: data.round,
        loading: Boolean(data.loading),
        stream: Boolean(data.stream),
      });

      const roundId = normalizeRoundId(data.round);
      if (Boolean(data.stream) && roundId !== null) {
        systemRoundPending.set(roundId, (systemRoundPending.get(roundId) || 0) + 1);
        if (roundId === currentSystemRound) {
          setOrchestratorWaiting(true);
        }
      }
    }
  });

  stream.addEventListener("round_start", (event) => {
    const data = JSON.parse(event.data);
    const roundId = normalizeRoundId(data.round);
    if (roundId === null) {
      return;
    }
    if (String(data.label || "").trim().toLowerCase() === "verdict") {
      roundTabLabels.set(roundId, "Preparing Verdict...");
    }
    clearSystemLoadingIndicators();
    if (councilHeaderEl) {
      councilHeaderEl.textContent = "Council's messages";
    }
    const prevSystemRound = currentSystemRound;
    currentSystemRound = roundId;
    const roundPayload = ensureRoundContainer(roundId);
    ensureCouncilRoundContainer(roundId);
    if (activeSystemRound === null) {
      setActiveRound(roundId);
    }

    setOrchestratorWaiting(true);

    analysisPendingRounds.add(roundId);
    if (roundPayload?.tab) {
      roundPayload.tab.classList.add("pending");
    }

    if (roundId === 1 && prevSystemRound === 0) {
      if ((systemRoundPending.get(roundId) || 0) === 0) {
        startAnalysisHold(roundId);
      } else {
        analysisStartDeferred.add(roundId);
      }
    } else {
      startAnalysisHold(roundId);
    }

    if ((systemRoundPending.get(roundId) || 0) > 0) {
      setOrchestratorWaiting(true);
    }

    if (roundId === 0 && !councilsBooted) {
      setRoundBeginControl(0, { booting: true });
    } else if (String(data.label || "").trim().toLowerCase() === "verdict") {
      setRoundBeginControl(roundId, { processing: true, processingMessage: "Preparing Verdict..." });
    } else {
      pendingRoundBeginControls.add(roundId);
      if (roundId > 0) setOrchestratorWaiting(true);
      flushDeferredRoundUi();
    }
  });

  stream.addEventListener("panel_selected", (event) => {
    const data = JSON.parse(event.data);

    if (data.benched) {
      data.benched.forEach((stateName) => {
        const normalized = normalizeStateName(stateName);
        const targets = getStateLayers(normalized);
        targets.forEach((layer) => {
          layer.setStyle({
            className: "state-path",
            fillColor: "#090909",
            fillOpacity: 0.12,
            color: "rgba(255, 255, 255, 0.06)",
            weight: 0.8,
          });
        });
      });
    }
    if (data.selected) {
      data.selected.forEach((stateName) => {
        const normalized = normalizeStateName(stateName);
        const targets = getStateLayers(normalized);
        targets.forEach((layer) => {
          layer.setStyle(activeStateStyle);
        });
      });
    }
    if (data.benched) {
      data.benched.forEach((stateName) => {
        agentCards.forEach((card, name) => {
          if (name.includes(stateName)) {
            card.classList.add("benched");
          }
        });
      });
    }
  });

  stream.addEventListener("rebuttal_selected", (event) => {
    JSON.parse(event.data);
  });

  stream.addEventListener("reply_selected", (event) => {
    JSON.parse(event.data);
  });

  stream.addEventListener("round_summary", (event) => {
    const data = JSON.parse(event.data);
    const isCompact = Boolean(layoutElement?.classList.contains("compact-mode"));
    if (!isCompact || !data?.message) {
      return;
    }
    const roundId = normalizeRoundId(data.round);
    if (roundId === null) {
      return;
    }
    const label = data.label || `Round ${roundId}`;
    safeAddNote(`${label} Summary\n${data.message}`, { round: roundId });
  });

  stream.addEventListener("agent", (event) => {
    const data = JSON.parse(event.data);
    upsertAgentMessage(data);
    clearDebateLoading(data);
  });

  stream.addEventListener("agent_start", (event) => {
    const data = JSON.parse(event.data);
    upsertAgentStreamMessage({ ...data, message: "", _eventType: "start" });
  });

  stream.addEventListener("agent_delta", (event) => {
    const data = JSON.parse(event.data);
    upsertAgentStreamMessage({ ...data, _eventType: "delta" });
    clearDebateLoading(data);
  });

  stream.addEventListener("agent_end", (event) => {
    const data = JSON.parse(event.data);
    upsertAgentStreamMessage({ ...data, _eventType: "end" });
    clearDebateLoading(data);
  });

  stream.addEventListener("council_end", (event) => {
    const data = JSON.parse(event.data);
    const resultRoundId = normalizeRoundId(data.round);
    if (resultRoundId === 4) {
      roundTabLabels.set(4, "Verdict");
      updateRoundTabMarkers();
    }
    if (currentSystemRound !== null) {
      addCompletedRoundTab(currentSystemRound);
    }
    setRoundBeginControl(null);
    if (data.summary) {
      if (resultRoundId !== null) {
        safeAddNote(data.summary, { round: resultRoundId });
      } else {
        safeAddNote(data.summary);
      }
    }

    if (data.impacts && (data.impacts.positive || data.impacts.negative)) {
      const pos = (data.impacts.positive || []).filter(Boolean);
      const neg = (data.impacts.negative || []).filter(Boolean);
      if (pos.length || neg.length) {
        const posText = pos.length ? `Positively impacted: ${pos.join(", ")}` : "Positively impacted: n/a";
        const negText = neg.length ? `Negatively impacted: ${neg.join(", ")}` : "Negatively impacted: n/a";
        if (resultRoundId !== null) {
          safeAddNote(`${posText}\n${negText}`, { round: resultRoundId });
        } else {
          safeAddNote(`${posText}\n${negText}`);
        }
      }
    }

    if (activeFeedCard) {
      const badge = activeFeedCard.querySelector(".badge");
      if (badge) {
        badge.textContent = "Completed";
        badge.classList.remove("processing");
        badge.classList.add("completed");
      }
      activeFeedCard.classList.remove("active", "processing");
      activeFeedCard = null;
      updateFeedEmptyState();
    }
    
    stateLayer.eachLayer((layer) => {
      layer.getElement()?.classList.remove("active");
      layer.setStyle(baseStateStyle);
    });
    stateImpact.clear();

    if (data.impacts) {
      (data.impacts.positive || []).forEach((s) => setStateImpact(s, "positive"));
      (data.impacts.negative || []).forEach((s) => setStateImpact(s, "negative"));
    }

    stopDebateRunningIndicator();
    setDebateLocked(false);
    if (fetchNextBtn) {
      fetchNextBtn.disabled = false;
      fetchNextBtn.classList.remove("is-loading");
      fetchNextBtn.textContent = "Begin Simulation";
    }
  });

  stream.addEventListener("status", (event) => {
    const data = JSON.parse(event.data);
    if (data.message && !data.message.toLowerCase().includes("model:") && !data.message.toLowerCase().includes("provider:")) {
      safeAddNote(data.message);
    }
    if (data.model) {
      setStatusText(statusModel, `model: ${data.model}`);
    }
    if (data.connection) {
      setStatusText(statusConnection, data.connection);
    }
  });

  stream.addEventListener("error", () => {
    safeAddNote("Stream disconnected. Retrying...");
    setStatusText(statusConnection, "reconnecting");
  });
};

if (fetchNextBtn) {
  console.log("[BOOT] Begin Simulation button found, binding click handler");
  fetchNextBtn.addEventListener("click", async () => {
    console.log("[UI] Begin Simulation clicked, fetchLocked=", fetchLocked);
    if (fetchLocked) {
      return;
    }
    const query = topicInput?.value?.trim() || "";
    if (!query) {
      safeAddNote("Enter policy details to begin the simulation.");
      return;
    }

    const provider = document.getElementById("provider-select")?.value || "openrouter";
    const apiKeyInput = document.getElementById("api-key-input");
    const apiKey = apiKeyInput?.value?.trim() || "";

    const providerConfig = PROVIDERS[provider];
    const requiresKey = providerConfig ? providerConfig.requiresKey !== false : true;

    if (requiresKey && !apiKey) {
      const providerName = providerConfig?.name || provider.toUpperCase();
      safeAddNote(`[API Key Required] Please enter your ${providerName} API key before beginning the round.`);
      if (apiKeyInput) {
        apiKeyInput.focus();
        apiKeyInput.classList.remove("input-error-pulse");
        void apiKeyInput.offsetWidth;
        apiKeyInput.classList.add("input-error-pulse");
        setTimeout(() => apiKeyInput.classList.remove("input-error-pulse"), 1200);
      }
      return;
    }

    fetchLocked = true;
    setDebateLocked(true);
    fetchNextBtn.disabled = true;
    fetchNextBtn.classList.add("is-loading");
    fetchNextBtn.textContent = "Starting Simulation";
    stateLayer.eachLayer((layer) => {
      layer.getElement()?.classList.remove("active");
      layer.setStyle(baseStateStyle);
    });
    stateImpact.clear();

    const modelInput = document.getElementById("model-input");
    const modelSelect = document.getElementById("model-select");
    const model = (provider === "lmstudio" ? modelInput?.value?.trim() : modelSelect?.value?.trim()) || providerConfig?.defaultModel || "";

    try {
      const response = await fetch("/api/next", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          query,
          provider,
          model,
          apiKey,
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.ok) {
        throw new Error(resData?.error || "Failed to start simulation.");
      }
    } catch (error) {
      stopDebateRunningIndicator();
      setDebateLocked(false);
      fetchNextBtn.disabled = false;
      fetchNextBtn.classList.remove("is-loading");
      fetchNextBtn.textContent = "Begin Simulation";
      safeAddNote(error.message || "Failed to start simulation.");
    }
  });
}

const PROVIDERS = {
  openrouter: {
    name: "OpenRouter",
    badge: "Cloud (Router)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-6.1-sol-pro",
    exampleModels: [
      "openai/gpt-6.1-sol-pro",
      "google/gemini-3.8-flash",
      "anthropic/claude-sonnet-5-5",
      "deepseek/deepseek-r1",
    ],
    keyHint: "Required",
    keyPlaceholder: "sk-or-v1-...",
  },
  openai: {
    name: "OpenAI",
    badge: "Cloud",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-6.1-sol",
    exampleModels: [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6-luna",
      "gpt-4o",
    ],
    keyHint: "Required",
    keyPlaceholder: "sk-...",
  },
  anthropic: {
    name: "Anthropic",
    badge: "Cloud",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-5-5",
    exampleModels: [
      "claude-fable-5-1",
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-4-5",
    ],
    keyHint: "Required",
    keyPlaceholder: "sk-ant-...",
  },
  groq: {
    name: "Groq",
    badge: "Cloud (Fast)",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    exampleModels: [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ],
    keyHint: "Required",
    keyPlaceholder: "gsk_...",
  },
  lmstudio: {
    name: "LM Studio",
    badge: "Local (Port 1235)",
    baseUrl: "http://localhost:1235/v1",
    defaultModel: "local-model",
    exampleModels: [],
    keyHint: "Not required",
    keyPlaceholder: "None (local server)",
    requiresKey: false,
    customInput: true,
  },
};


const initProviderConfig = () => {
  const providerSelect = document.getElementById("provider-select");
  const modelSelect = document.getElementById("model-select");
  const modelSelectWrapper = document.getElementById("model-select-wrapper");
  const modelInput = document.getElementById("model-input");
  const modelInputWrapper = document.getElementById("model-input-wrapper");
  const modelFieldLabel = document.getElementById("model-field-label");
  const apiKeyInput = document.getElementById("api-key-input");
  const providerBadge = document.getElementById("provider-badge");
  const apiKeyHint = document.getElementById("api-key-hint");
  const toggleKeyBtn = document.getElementById("toggle-key-visibility");

  if (!providerSelect || !modelSelect) return;

  const modelCache = {};

  const getActiveModel = () => {
    if (providerSelect?.value === "lmstudio") {
      return modelInput?.value?.trim() || "";
    }
    return modelSelect?.value?.trim() || "";
  };

  const setActiveModel = (val) => {
    if (val === undefined || val === null) return;
    if (modelInput) {
      modelInput.value = val;
    }
    if (modelSelect) {
      let matched = false;
      for (let i = 0; i < modelSelect.options.length; i++) {
        if (modelSelect.options[i].value === val) {
          modelSelect.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched && val) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        modelSelect.prepend(opt);
        modelSelect.selectedIndex = 0;
      }
    }
  };

  const updateModelMode = (providerKey) => {
    const isLmStudio = providerKey === "lmstudio";
    if (isLmStudio) {
      if (modelSelectWrapper) modelSelectWrapper.style.display = "none";
      if (modelInputWrapper) modelInputWrapper.style.display = "flex";
      if (modelFieldLabel) modelFieldLabel.setAttribute("for", "model-input");
    } else {
      if (modelSelectWrapper) modelSelectWrapper.style.display = "flex";
      if (modelInputWrapper) modelInputWrapper.style.display = "none";
      if (modelFieldLabel) modelFieldLabel.setAttribute("for", "model-select");
    }
  };

  const updateModelOptions = (providerKey, models, preferredModel) => {
    const targetModel = preferredModel || getActiveModel() || PROVIDERS[providerKey]?.defaultModel || (models && models[0]) || "";

    modelSelect.innerHTML = "";
    const list = (models && models.length > 0) ? models : (PROVIDERS[providerKey]?.exampleModels || []);
    list.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });

    let found = false;
    for (let i = 0; i < modelSelect.options.length; i++) {
      if (modelSelect.options[i].value === targetModel) {
        modelSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found && targetModel) {
      const opt = document.createElement("option");
      opt.value = targetModel;
      opt.textContent = targetModel;
      modelSelect.prepend(opt);
      modelSelect.selectedIndex = 0;
    }
  };

  const saveConfigLocally = () => {
    try {
      const payload = {
        provider: providerSelect.value,
        model: getActiveModel(),
      };
      localStorage.setItem("policy_llm_config", JSON.stringify(payload));
    } catch (e) {
    }
  };

  let syncTimer = null;
  const syncConfigToServer = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      const provider = providerSelect.value;
      const model = getActiveModel();
      const apiKey = apiKeyInput?.value?.trim() || "";
      try {
        const res = await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            provider,
            model,
            apiKey,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (res.status !== 409) {
            safeAddNote(`[Config] ${body?.error || "Could not save provider settings."}`);
          }
        }
      } catch (err) {
        safeAddNote(`[Config] Could not reach server: ${err.message}`);
      }
    }, 350);
  };

  const loadModelsDynamically = async (providerKey, isManual = false) => {
    const config = PROVIDERS[providerKey] || PROVIDERS.openrouter;
    const apiKey = apiKeyInput?.value?.trim() || "";
    const currentModel = getActiveModel();

    try {
      const q = new URLSearchParams({ provider: providerKey });

      const headers = authHeaders();
      if (apiKey) headers["X-API-Key"] = apiKey;

      const res = await fetch(`/api/models?${q.toString()}`, { headers });
      const data = await res.json();

      if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
        modelCache[providerKey] = data.models;
        updateModelOptions(providerKey, data.models, currentModel || config.defaultModel);
        saveConfigLocally();
        syncConfigToServer();
        return;
      }

      if (data.error && isManual) {
        safeAddNote(`[Models] ${data.error}`);
      }
    } catch (err) {
      if (isManual) {
        safeAddNote(`[Models] Failed to fetch: ${err.message}`);
      }
    }

    const fallbackList = modelCache[providerKey] || config.exampleModels || [];
    updateModelOptions(providerKey, fallbackList, currentModel || config.defaultModel);
  };

  const applyProvider = (providerKey, isInitial = false, explicitModel = null) => {
    const config = PROVIDERS[providerKey] || PROVIDERS.openrouter;
    if (providerBadge) providerBadge.textContent = config.badge;
    if (apiKeyHint) apiKeyHint.textContent = config.keyHint;
    if (apiKeyInput) apiKeyInput.placeholder = config.keyPlaceholder;

    updateModelMode(providerKey);

    const chosenModel = explicitModel || (isInitial ? getActiveModel() : (config.defaultModel || (config.exampleModels && config.exampleModels[0]) || ""));
    const initialList = modelCache[providerKey] || config.exampleModels || [];
    updateModelOptions(providerKey, initialList, chosenModel);

    if (!isInitial) {
      setActiveModel(chosenModel);
      saveConfigLocally();
      syncConfigToServer();
    }

    if (!config.customInput) {
      loadModelsDynamically(providerKey, false);
    }
  };

  toggleKeyBtn?.addEventListener("click", () => {
    if (!apiKeyInput) return;
    const isPassword = apiKeyInput.type === "password";
    apiKeyInput.type = isPassword ? "text" : "password";
    const eyeOpen = toggleKeyBtn.querySelector(".eye-open");
    const eyeClosed = toggleKeyBtn.querySelector(".eye-closed");
    if (eyeOpen) eyeOpen.style.display = isPassword ? "none" : "block";
    if (eyeClosed) eyeClosed.style.display = isPassword ? "block" : "none";
  });

  providerSelect.addEventListener("change", () => {
    applyProvider(providerSelect.value, false);
  });

  modelSelect?.addEventListener("change", () => {
    saveConfigLocally();
    syncConfigToServer();
  });

  modelInput?.addEventListener("input", () => {
    saveConfigLocally();
    syncConfigToServer();
  });

  let keyDebounceTimer = null;
  apiKeyInput?.addEventListener("input", () => {
    saveConfigLocally();
    syncConfigToServer();
    clearTimeout(keyDebounceTimer);
    keyDebounceTimer = setTimeout(() => {
      const pCfg = PROVIDERS[providerSelect.value];
      if (!pCfg?.customInput) {
        loadModelsDynamically(providerSelect.value, false);
      }
    }, 600);
  });

  let restored = false;
  try {
    const saved = localStorage.getItem("policy_llm_config");
    if (saved) {
      const data = JSON.parse(saved);
      if (data.provider && PROVIDERS[data.provider]) {
        providerSelect.value = data.provider;
      }
      applyProvider(providerSelect.value, true, data.model);
      if (data.model) setActiveModel(data.model);
      restored = true;
      syncConfigToServer();
    }
  } catch (e) {
  }

  if (!restored) {
    fetch("/api/config", { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          window.location.href = "login.html";
          return null;
        }
        return r.json();
      })
      .then((cfg) => {
        if (!cfg) return;
        if (cfg.provider && PROVIDERS[cfg.provider]) {
          providerSelect.value = cfg.provider;
        }
        applyProvider(providerSelect.value, true, cfg.model);
        if (cfg.model) setActiveModel(cfg.model);
      })
      .catch(() => {
        applyProvider(providerSelect.value || "openrouter", true);
      });
  }
};

ensureSystemNotesContainer();
ensureAgentsContainer();
initProviderConfig();

connectLiveStream();

