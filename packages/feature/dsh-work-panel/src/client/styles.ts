/**
 * The work panel stylesheet, injected as one <style data-plugin> tag at apply
 * time (the module loader removes plugin-owned tags on unload). Every color
 * comes from the dsh theme tokens; motion stays inside 150–300ms and honors
 * prefers-reduced-motion.
 *
 * @module @neplich/dsh-work-panel/client/styles
 */
export const WORK_PANEL_CSS = `
.dshwp-root {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: none;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  pointer-events: auto;
  background: var(--dsw-alias-bg-base);
  border-left: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  font-size: 13px;
  overflow: hidden;
  outline: none;
  animation: dshwp-enter 180ms ease-out;
}

@keyframes dshwp-enter {
  from { opacity: 0; transform: translateX(12px); }
  to { opacity: 1; transform: translateX(0); }
}

.dshwp-drag {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 8px;
  margin-left: -4px;
  cursor: col-resize;
  z-index: 2;
  touch-action: none;
}
.dshwp-drag:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}

.dshwp-header {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 8px;
  flex: none;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dshwp-title {
  flex: 1;
  min-width: 0;
  padding-left: 4px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-primary);
}
.dshwp-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.dshwp-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}
.dshwp-iconbtn:hover {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.dshwp-iconbtn:active {
  background: var(--dsw-alias-bg-layer-2);
}
.dshwp-iconbtn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}

.dshwp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Entry page: the tool cards, vertically centered as in the reference. */
.dshwp-entries {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 0 20px;
}
.dshwp-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
  transition: background-color 180ms ease, border-color 180ms ease;
}
.dshwp-entry:hover {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
}
.dshwp-entry:active {
  background: var(--dsw-alias-bg-layer-2);
}
.dshwp-entry:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.dshwp-entryIcon {
  flex: none;
  display: inline-flex;
  color: var(--dsw-alias-label-secondary);
}
.dshwp-entry:hover .dshwp-entryIcon {
  color: var(--dsw-alias-label-primary);
}
.dshwp-entryName {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* File workspace: breadcrumb toolbar, preview canvas, optional directory tree. */
.dshwp-fileToolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 48px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dshwp-breadcrumb {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: hidden;
}
.dshwp-breadcrumbPart {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--dsw-alias-label-primary);
}
.dshwp-breadcrumbPart > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.dshwp-fileActions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.dshwp-fileTextButton {
  height: 28px;
  padding: 0 9px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
  transition: background-color 150ms ease;
}
.dshwp-fileTextButton:hover,
.dshwp-fileTreeToggle[data-active] {
  background: var(--dsw-alias-bg-layer-2);
}
.dshwp-fileTextButton:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dshwp-fileWorkspace {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}
.dshwp-fileCanvas {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  background: var(--dsw-alias-bg-base);
}
.dshwp-fileTreePane {
  flex: 0 0 clamp(140px, 42%, 340px);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
}
.dshwp-fileFilter {
  flex: none;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  margin: 8px 10px 4px;
  padding: 0 7px 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-base);
}
.dshwp-fileFilter:focus-within {
  border-color: var(--dsw-alias-brand-primary);
}
.dshwp-fileFilter input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.dshwp-fileFilter input::placeholder {
  color: var(--dsw-alias-label-secondary);
}
.dshwp-fileFilter input::-webkit-search-cancel-button {
  opacity: 0.65;
}
.dshwp-fileFilterAction {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dshwp-fileFilterAction:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
}
.dshwp-fileFilterAction:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dshwp-fileEmpty {
  flex: 1;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
}
.dshwp-fileEmptyIcon {
  display: inline-flex;
  margin-bottom: 4px;
}
.dshwp-fileEmpty strong {
  color: var(--dsw-alias-label-primary);
  font-size: 18px;
  font-weight: 500;
}
.dshwp-fileEmpty > span:last-child {
  font-size: 13px;
}
.dshwp-srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.dshwp-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 8px 12px;
  outline: none;
}
.dshwp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 3px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 22px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition: background-color 150ms ease;
}
.dshwp-row:hover {
  background: var(--dsw-alias-bg-layer-1);
}
.dshwp-row:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dshwp-row[data-selected] {
  background: var(--dsw-alias-bg-layer-2);
}
.dshwp-chevron {
  flex: none;
  display: inline-flex;
  width: 14px;
  color: var(--dsw-alias-label-secondary);
}
.dshwp-rowIcon {
  flex: none;
  display: inline-flex;
  color: var(--dsw-alias-label-secondary);
}
.dshwp-rowName {
  overflow: hidden;
  text-overflow: ellipsis;
}
.dshwp-note {
  padding: 10px 14px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.dshwp-noteRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

/* File preview. */
.dshwp-preview {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.dshwp-previewBody {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 18px 24px 36px;
}
.dshwp-previewBody > * {
  min-width: 0;
  max-width: 100%;
}
.dshwp-previewBody :not(pre) > code {
  display: inline;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.dshwp-previewBody table {
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
}
.dshwp-previewBody :where(th, td) {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.dshwp-previewBodyMedia {
  padding: 0;
  overflow: hidden;
}
.dshwp-pdfRoot {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--dsw-alias-bg-base);
}
.dshwp-pdfToolbar {
  position: relative;
  z-index: 3;
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px 6px;
  min-width: 0;
  min-height: 38px;
  padding: 4px 7px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
}
.dshwp-pdfControlGroup {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.dshwp-pdfControlGroupEnd {
  margin-left: auto;
}
.dshwp-pdfButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  text-decoration: none;
  transition: background-color 150ms ease, color 150ms ease, opacity 150ms ease;
}
.dshwp-pdfButton:hover:not(:disabled),
.dshwp-pdfButton[data-active] {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.dshwp-pdfButton:focus-visible,
.dshwp-pdfPageInput:focus-visible,
.dshwp-pdfFind:focus-within,
.dshwp-pdfPassword input:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dshwp-pdfButton:disabled {
  opacity: .38;
  cursor: default;
}
.dshwp-pdfPageInput {
  width: 34px;
  height: 25px;
  padding: 0 4px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 5px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: center;
  -moz-appearance: textfield;
}
.dshwp-pdfPageInput::-webkit-outer-spin-button,
.dshwp-pdfPageInput::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}
.dshwp-pdfPages,
.dshwp-pdfScale,
.dshwp-pdfFindCount {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dshwp-pdfScale {
  width: 38px;
  text-align: center;
}
.dshwp-pdfFind {
  order: 3;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 3px 0 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
}
.dshwp-pdfFind input {
  flex: 1;
  min-width: 44px;
  height: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.dshwp-pdfStage {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-1);
}
.dshwp-pdfContainer {
  position: absolute;
  inset: 0;
  overflow: auto;
  outline: none;
}
.dshwp-pdfContainer .pdfViewer {
  min-width: 100%;
  padding: 10px 0 2px;
}
.dshwp-pdfContainer .pdfViewer .page {
  box-shadow: 0 1px 4px var(--dsw-alias-border-l2);
}
.dshwp-pdfStatus,
.dshwp-pdfPassword {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-base);
  text-align: center;
}
.dshwp-pdfStatus .dshwp-fileTextButton {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dshwp-pdfProgress {
  width: min(180px, 70%);
  height: 2px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--dsw-alias-bg-layer-2);
}
.dshwp-pdfProgress > span {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: left center;
  background: var(--dsw-alias-brand-primary);
  transition: transform 180ms ease;
}
.dshwp-pdfPassword {
  z-index: 4;
}
.dshwp-pdfPassword strong {
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
.dshwp-pdfPassword label {
  width: min(240px, 100%);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-align: left;
}
.dshwp-pdfPassword input {
  width: min(240px, 100%);
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.dshwp-pdfPassword .dshwp-fileTextButton {
  background: var(--dsw-alias-bg-layer-2);
}
.dshwp-pdfPassword .dshwp-fileTextButton:disabled {
  opacity: .38;
  cursor: default;
}
.dshwp-sourceText {
  min-width: 0;
  max-width: 100%;
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-markdown-code-block);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  tab-size: 2;
}
.dshwp-sourceText code {
  padding: 0;
  background: none;
  color: inherit;
  font: inherit;
}
.dshwp-previewImage {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

/* Browser-native Office Open XML preview. */
.dshwp-officeRoot {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--dsw-alias-bg-base);
}
.dshwp-officeToolbar {
  flex-wrap: nowrap;
}
.dshwp-officePosition {
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshwp-officeStage {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-1);
}
.dshwp-officeContainer {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.dshwp-officeContainer canvas {
  max-width: none;
}

/* Mixed file/terminal work tabs. */
.dshwp-workTabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.dshwp-tabbar {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
}
.dshwp-tabscroll {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  overflow-x: auto;
  scrollbar-width: none;
}
.dshwp-tabscroll::-webkit-scrollbar {
  display: none;
}
.dshwp-tabcell {
  flex: none;
  display: flex;
  align-items: center;
  max-width: 150px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--dsw-alias-label-secondary);
}
.dshwp-tabcell:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.dshwp-tabcell[data-selected] {
  background: var(--dsw-alias-bg-base);
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
}
.dshwp-tab {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 4px 0 9px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.dshwp-tabIcon {
  flex: none;
  display: inline-flex;
}
.dshwp-tabLabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dshwp-tab:focus-visible,
.dshwp-tabClose:focus-visible,
.dshwp-tabAdd:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dshwp-tabClose,
.dshwp-tabAdd {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dshwp-tabClose:hover,
.dshwp-tabAdd:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.dshwp-tabAdd {
  margin-left: 4px;
}
.dshwp-tabpanels {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.dshwp-terminal {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
}
.dshwp-termhost {
  flex: 1;
  min-height: 0;
  padding: 6px 0 6px 10px;
  overflow: hidden;
}
.dshwp-termhost .xterm {
  height: 100%;
}
.dshwp-termbar {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.dshwp-termbarText {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dshwp-termbarBtn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 150ms ease;
}
.dshwp-termbarBtn:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.dshwp-termbarBtn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}

.dshwp-hidden {
  display: none !important;
}

.dshwp-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

@media (prefers-reduced-motion: reduce) {
  .dshwp-root {
    animation: none;
  }
  .dshwp-iconbtn,
  .dshwp-entry,
  .dshwp-row,
  .dshwp-tabcell,
  .dshwp-termbarBtn,
  .dshwp-pdfButton,
  .dshwp-pdfProgress > span {
    transition: none;
  }
}
`
