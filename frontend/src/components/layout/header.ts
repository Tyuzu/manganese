
import "../../../css/header.css";

import {
  button,
  div,
  h1,
  header,
  p,
  span,
} from "../ui/dom";

import { appStore, authActions } from "../../appState";
import { router } from "../../main";

import {
  APP_THEMES,
  EDITOR_THEMES,
  type AppTheme,
  type EditorThemeName,
} from "../../config/config";

import { createNavElement } from "./NavBar";

function formatThemeName(theme: string): string {
  return theme
    .split("-")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

function createThemeSelector(): HTMLElement {
  const state = appStore.getState();

  const selectedTheme =
    state.theme || state.editorTheme || "dark";

  const themeSelect = document.createElement("select");

  themeSelect.className = "header-theme-select";
  themeSelect.setAttribute("aria-label", "Select application theme");

  const availableThemes = [
    ...new Set([
      ...APP_THEMES,
      ...EDITOR_THEMES,
    ]),
  ];

  availableThemes.forEach((theme) => {
    const option = document.createElement("option");

    option.value = theme;
    option.textContent = formatThemeName(theme);

    themeSelect.appendChild(option);
  });

  themeSelect.value = availableThemes.includes(
    selectedTheme as never
  )
    ? selectedTheme
    : APP_THEMES[0];

  themeSelect.addEventListener("change", () => {
    const value = themeSelect.value;

    if (
      (APP_THEMES as readonly string[]).includes(value)
    ) {
      authActions.setTheme(value as AppTheme);
    }

    if (
      (EDITOR_THEMES as readonly string[]).includes(value)
    ) {
      authActions.setEditorTheme(value as EditorThemeName);
    }
  });

  const wrapper = div(
    { className: "header-theme-select-wrap" },
    themeSelect
  );

  return wrapper;
}

export function createHeaderActions(): HTMLElement {
  const state = appStore.getState();

  const isLoggedIn = Boolean(state.token);
  const userName = isLoggedIn
    ? state.handle || "Creator"
    : "Guest";

  const workspaceBadge = span(
    { className: "workspace-badge" },
    span({ className: "workspace-dot" }),
    `Workspace · ${userName}`
  );

  const statusBadge = span(
    { className: "active-status-badge" },
    span({ className: "active-status-dot" }),
    "Active"
  );

  const themeSelector = createThemeSelector();

  const authButton = button(
    {
      type: "button",
      className: "header-action-btn",
      onClick: () => {
        if (isLoggedIn) {
          authActions.logout();
          router.navigate("/login");
          return;
        }

        authActions.guest();
        router.navigate("/");
      },
    },
    isLoggedIn ? "Logout" : "Guest Mode"
  );

  return div(
    { className: "header-meta" },
    workspaceBadge,
    statusBadge,
    themeSelector,
    authButton
  );
}

export function createAppHeader(): HTMLElement {
  const brand = div(
    { className: "brand-block" },
    div(
      { className: "brand-mark" },
      "P"
    ),
    div(
      { className: "brand-copy" },
      h1({}, "PixelForge Studio"),
      p({}, "Microsoft Fluent UI Creative Workspace")
    )
  );

  const brandRow = div(
    { className: "brand-row" },
    brand,
    createHeaderActions()
  );

  const navShell = div(
    { className: "nav-shell" },
    createNavElement()
  );

  return header(
    { className: "app-header" },
    brandRow,
    navShell
  );
}
