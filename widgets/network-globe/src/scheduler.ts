// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

export type FrameLoopOptions = {
    requestFrame: (callback: (timestamp: number) => void) => number;
    cancelFrame: (handle: number) => void;
    isHidden: () => boolean;
    fps: number;
    render: (deltaMs: number) => void;
};

export type FrameLoop = {
    start: () => void;
    stop: () => void;
    // Call when the page becomes visible or hidden; the loop stops asking for frames while hidden.
    visibilityChanged: () => void;
    isRunning: () => boolean;
};

export function createFrameLoop(options: FrameLoopOptions): FrameLoop {
    const minInterval = 1000 / Math.max(1, options.fps);
    let handle: number | null = null;
    let wanted = false;
    let lastRender = 0;
    let lastTimestamp: number | null = null;

    const tick = (timestamp: number) => {
        handle = null;
        if (!wanted || options.isHidden()) {
            return;
        }
        if (lastTimestamp == null || timestamp - lastRender >= minInterval) {
            const delta = lastTimestamp == null ? 0 : timestamp - lastTimestamp;
            lastRender = timestamp;
            lastTimestamp = timestamp;
            options.render(delta);
        }
        handle = options.requestFrame(tick);
    };

    const schedule = () => {
        if (handle == null && wanted && !options.isHidden()) {
            handle = options.requestFrame(tick);
        }
    };

    return {
        start() {
            wanted = true;
            schedule();
        },
        stop() {
            wanted = false;
            if (handle != null) {
                options.cancelFrame(handle);
                handle = null;
            }
        },
        visibilityChanged() {
            if (options.isHidden()) {
                if (handle != null) {
                    options.cancelFrame(handle);
                    handle = null;
                }
                lastTimestamp = null;
            } else {
                schedule();
            }
        },
        isRunning() {
            return wanted && !options.isHidden();
        },
    };
}
