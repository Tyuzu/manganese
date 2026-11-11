import { article, div, button as tabButtonFactory } from "./dom";
import { makeDraggableScroll } from "./dragnav";
import { getState, setState } from "../../state/state";

/* =========================================================
   TYPES & INTERFACES
========================================================= */

export interface TabItem {
  id: string;
  title: string;
  render: (container: HTMLElement) => void;
}

interface RouteTabState {
  activeTab?: string;
  [key: string]: unknown;
}

interface GlobalState {
  routeState?: Record<string, RouteTabState>;
  scrollPositions?: Record<string, RouteTabState>;
  [key: string]: unknown;
}

export type OnTabChangeCallback = (tabId: string) => void;

/* =========================================================
   ROUTE STATE HELPERS
========================================================= */

function getRouteState(locationKey: string): RouteTabState | null {
  const state = (getState() as GlobalState) || {};
  const routeStates = state.routeState || state.scrollPositions || {};
  return routeStates[locationKey] || null;
}

function setRouteState(locationKey: string, value: RouteTabState): void {
  const currentState = (getState() as GlobalState) || {};
  const routeStates = currentState.routeState || currentState.scrollPositions || {};

  setState({
    ...currentState,
    routeState: {
      ...routeStates,
      [locationKey]: value,
    },
  });
}

/* =========================================================
   EXPORTED TAB FUNCTIONS
========================================================= */

/**
 * High-order layout helper that handles persisting active tab views via localStorage.
 */
export function persistTabs(
  container: HTMLElement | null,
  tabs: TabItem[],
  storageKey: string | null = null
): void {
  if (!container) return;
  try {
    const activeTabId = storageKey ? localStorage.getItem(storageKey) : null;

    const tabsElement = createTabs(tabs, null, activeTabId, (newTabId) => {
      if (storageKey) {
        localStorage.setItem(storageKey, newTabId);
      }
    });

    container.appendChild(tabsElement);
  } catch (err) {
    console.warn("Tabs component failed to initialize in container:", err);
  }
}

/**
 * Generates an accessible, performance-lazy rendering tab node interface.
 */
export function createTabs(
  tabs: TabItem[],
  routeKey: string | null = null,
  initialTabId: string | null = null,
  onTabChange: OnTabChangeCallback | null = null
): HTMLDivElement {
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return div({ className: "flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500" });
  }

  const tabContainer = div({ className: "flex flex-col gap-3" });
  const tabButtons = div({
    className: "flex flex-wrap gap-2 overflow-x-auto pb-1",
    role: "tablist",
    "aria-label": "Content Navigation Tabs",
  });
  const tabContents = div({ className: "mt-1" });

  const tabContentMap = new Map<string, HTMLElement>();
  const buttonMap = new Map<string, HTMLElement>();

  // Instantiate Interactive Tab View Models
  tabs.forEach(({ id, title }) => {
    const panelId = `panel-${id}`;
    const buttonId = `tab-btn-${id}`;

    const contentContainer = article({
      id: panelId,
      className: "hidden",
      role: "tabpanel",
      "aria-labelledby": buttonId,
      tabindex: "0",
    });

    const tabButton = tabButtonFactory({
      id: buttonId,
      className: "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-100 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-blue-200",
      role: "tab",
      "aria-controls": panelId,
      "aria-selected": "false",
      tabindex: "0",
      onClick: () => activateTab(id),
      onKeyDown: ((e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activateTab(id);
        }
      }) as EventListener,
    }, title);

    tabButtons.appendChild(tabButton);
    tabContents.appendChild(contentContainer);

    tabContentMap.set(id, contentContainer);
    buttonMap.set(id, tabButton);
  });

  // Attach horizontal swipe nav features if active
  if (typeof makeDraggableScroll === "function") {
    makeDraggableScroll(tabButtons);
  }

  tabContainer.appendChild(tabButtons);
  tabContainer.appendChild(tabContents);

  /**
   * Toggles layout active states and handles lazy evaluation injections
   */
  function activateTab(tabId: string): void {
    tabs.forEach(({ id, render }) => {
      const btn = buttonMap.get(id);
      const content = tabContentMap.get(id);
      const isActive = id === tabId;

      if (btn && content) {
        btn.classList.toggle("bg-blue-50", isActive);
        btn.classList.toggle("text-blue-700", isActive);
        btn.classList.toggle("border-blue-200", isActive);
        btn.classList.toggle("bg-white", !isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
        content.classList.toggle("hidden", !isActive);
        content.classList.toggle("block", isActive);

        // Lazy Rendering Verification Block
        if (isActive && !content.dataset.rendered) {
          if (typeof render === "function") {
            render(content);
          }
          content.dataset.rendered = "true";
        }
      }
    });

    // Router history persistence integration check
    if (routeKey) {
      const tabState = getRouteState(routeKey) || {};
      tabState.activeTab = tabId;
      setRouteState(routeKey, tabState);
    }

    if (typeof onTabChange === "function") {
      onTabChange(tabId);
    }
  }

  // State Resolution Loop
  let initial = initialTabId || tabs[0]?.id;

  if (routeKey) {
    const saved = getRouteState(routeKey);
    if (saved?.activeTab && tabContentMap.has(saved.activeTab)) {
      initial = saved.activeTab;
    }
  }

  // Defer initialization past current execution call stack
  if (initial) {
    queueMicrotask(() => activateTab(initial));
  }

  return tabContainer;
}