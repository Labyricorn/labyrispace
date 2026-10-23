// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export function findLaspAIPanel(element: HTMLElement): HTMLElement | null {
    let current: HTMLElement = element;
    while (current) {
        if (current.hasAttribute("data-laspai-panel")) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

export function laspAIHasFocusWithin(focusTarget?: Element | null): boolean {
    if (focusTarget !== undefined) {
        if (focusTarget instanceof HTMLElement) {
            return findLaspAIPanel(focusTarget) != null;
        }
        return false;
    }

    const focused = document.activeElement;
    if (focused instanceof HTMLElement) {
        const laspAIPanel = findLaspAIPanel(focused);
        if (laspAIPanel) return true;
    }

    const sel = document.getSelection();
    if (sel && sel.anchorNode && sel.rangeCount > 0 && !sel.isCollapsed) {
        let anchor = sel.anchorNode;
        if (anchor instanceof Text) {
            anchor = anchor.parentElement;
        }
        if (anchor instanceof HTMLElement) {
            const laspAIPanel = findLaspAIPanel(anchor);
            if (laspAIPanel) return true;
        }
    }

    return false;
}

export function laspAIHasSelection(): boolean {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        return false;
    }

    let anchor = sel.anchorNode;
    if (anchor instanceof Text) {
        anchor = anchor.parentElement;
    }
    if (anchor instanceof HTMLElement) {
        return findLaspAIPanel(anchor) != null;
    }

    return false;
}