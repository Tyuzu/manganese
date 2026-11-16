
import "../../../css/nav.css";
import { a, button, div, nav, span } from "../ui/dom";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "⌂" },
  { label: "Image Studio", href: "/images", icon: "▧" },
  { label: "Video Editor", href: "/videos", icon: "▷" },
  { label: "Scan", href: "/scan", icon: "◎" },
  { label: "PDF Workspace", href: "/pdf", icon: "▤" },
];

const NAV_ID = "main-navigation-links";

function normalizePath(path: string): string {
  const normalized = path.split("?")[0].split("#")[0];

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized || "/";
}

function isActiveRoute(path: string, href: string): boolean {
  const current = normalizePath(path);
  const target = normalizePath(href);

  if (target === "/") {
    return current === "/";
  }

  return current === target || current.startsWith(`${target}/`);
}

function createNavLink(
  item: NavItem,
  currentPath: string
): HTMLElement {
  const active = isActiveRoute(currentPath, item.href);

  return a(
    {
      href: item.href,
      className: `nav-link${active ? " is-active" : ""}`,
      "data-link": "",
      ...(active ? { "aria-current": "page" } : {}),
    },
    span(
      {
        className: "nav-link-icon",
        "aria-hidden": "true",
      },
      item.icon
    ),
    span(
      { className: "nav-link-label" },
      item.label
    ),
    span({
      className: "nav-link-indicator",
      "aria-hidden": "true",
    })
  );
}

export function createNavElement(): HTMLElement {
  const navEl = nav({
    className: "nav-bar",
    role: "navigation",
    "aria-label": "Main navigation",
  });

  const currentPath = window.location.pathname;

  const navList = div(
    {
      className: "nav-links",
      id: NAV_ID,
      "data-nav-list": "",
    },
    ...NAV_ITEMS.map((item) =>
      createNavLink(item, currentPath)
    )
  );

  const toggleButton = button(
    {
      type: "button",
      className: "nav-toggle",
      "aria-expanded": "false",
      "aria-controls": NAV_ID,
      "aria-label": "Open navigation menu",
      onClick: () => {
        const nextOpen = navEl.dataset.open !== "true";

        setMenuState(nextOpen);
      },
    },
    span(
      { className: "nav-toggle-label" },
      "Menu"
    ),
    span(
      {
        className: "nav-toggle-icon",
        "aria-hidden": "true",
      },
      "☰"
    )
  );

  function setMenuState(open: boolean): void {
    navEl.dataset.open = String(open);

    toggleButton.setAttribute(
      "aria-expanded",
      String(open)
    );

    toggleButton.setAttribute(
      "aria-label",
      open ? "Close navigation menu" : "Open navigation menu"
    );

    navList.classList.toggle("is-open", open);
    navEl.classList.toggle("menu-expanded", open);
  }

  // Close the mobile menu after navigation.
  navList.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const link = target.closest("a");

    if (link) {
      setMenuState(false);
    }
  });

  // Initial state.
  setMenuState(false);

  const mobileControls = div(
    { className: "nav-mobile-header" },
    toggleButton
  );

  navEl.append(mobileControls, navList);

  return navEl;
}

/**
 * Refresh active navigation state after client-side routing.
 * Call this after router navigation if the nav element remains mounted.
 */
export function updateNavActiveState(path: string): void {
  const navList = document.querySelector(".nav-links");

  if (!navList) return;

  NAV_ITEMS.forEach((item) => {
    const link = Array.from(
      navList.querySelectorAll("a")
    ).find((element) => element.getAttribute("href") === item.href);

    if (!link) return;

    const active = isActiveRoute(path, item.href);

    link.classList.toggle("is-active", active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}
