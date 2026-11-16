
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

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}

function isActiveRoute(path: string, href: string): boolean {
  const current = normalizePath(path);
  const target = normalizePath(href);

  if (target === "/") {
    return current === "/";
  }

  return current === target || current.startsWith(`${target}/`);
}

function createNavLink(item: NavItem, currentPath: string): HTMLElement {
  const active = isActiveRoute(currentPath, item.href);

  return a(
    {
      href: item.href,
      className: `nav-link${active ? " is-active" : ""}`,
      "data-link": "",
      ...(active ? { "aria-current": "page" } : {}),
    },
    span({ className: "nav-link-icon", "aria-hidden": "true" }, item.icon),
    span({ className: "nav-link-label" }, item.label),
    ...(active
      ? [span({ className: "nav-link-indicator", "aria-hidden": "true" }, "")]
      : [])
  );
}

export function createNavElement(): HTMLElement {
  const currentPath = window.location.pathname;

  const navEl = nav({
    className: "nav-bar",
    role: "navigation",
    "aria-label": "Main navigation",
  });

  const brand = div(
    { className: "nav-brand" },
    span({ className: "nav-brand-mark" }, "✦"),
    span({ className: "nav-brand-name" }, "Workspace")
  );

  const navList = div(
    {
      className: "nav-links",
      "data-nav-list": "",
    },
    ...NAV_ITEMS.map((item) => createNavLink(item, currentPath))
  );

  const toggleButton = button(
    {
      type: "button",
      className: "nav-toggle",
      "aria-expanded": "false",
      "aria-controls": "main-navigation-links",
      "aria-label": "Open navigation menu",
      onClick: () => {
        const isOpen = navEl.dataset.open === "true";
        const nextOpen = !isOpen;

        navEl.dataset.open = String(nextOpen);

        toggleButton.setAttribute(
          "aria-expanded",
          String(nextOpen)
        );

        toggleButton.setAttribute(
          "aria-label",
          nextOpen ? "Close navigation menu" : "Open navigation menu"
        );

        navList.classList.toggle("is-open", nextOpen);
        navEl.classList.toggle("menu-expanded", nextOpen);
      },
    },
    span({ className: "nav-toggle-label" }, "Menu"),
    span(
      { className: "nav-toggle-icon", "aria-hidden": "true" },
      "☰"
    )
  );

  navList.id = "main-navigation-links";

  const mobileHeader = div(
    { className: "nav-mobile-header" },
    brand,
    toggleButton
  );

  navEl.dataset.open = "false";

  navEl.append(mobileHeader, navList);

  return navEl;
}
