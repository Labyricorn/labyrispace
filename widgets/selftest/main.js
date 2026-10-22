(async () => {
    const results = {};
    const bridge = window.labyrispaceWidget;
    const attempt = async (name, fn) => {
        try {
            results[name] = { ok: true, value: await fn() };
        } catch (e) {
            results[name] = { ok: false, error: String(e && e.message ? e.message : e).slice(0, 120) };
        }
    };
    results.bridgeKeys = Object.keys(bridge || {});
    results.nodeLeaks = [typeof require, typeof process, typeof window.api, typeof window.electron];
    await attempt("host.info", () => bridge.call("host.info"));
    await attempt("settings.set", () => bridge.call("settings.set", { probe: 1 }));
    await attempt("settings.get", () => bridge.call("settings.get"));
    await attempt("theme.get (not declared)", () => bridge.call("theme.get"));
    await attempt("network.interfaces", () => bridge.call("network.interfaces"));
    await attempt("network.connections", () => bridge.call("network.connections"));
    await attempt("network.geolookup", () => bridge.call("network.geolookup", { ips: ["203.0.113.9", "10.1.2.3", "127.0.0.1", "8.8.8.8", "bogus"] }));
    await attempt("network.geolookup bad args", () => bridge.call("network.geolookup", { ips: ["8.8.8.8\r\nx"] }));
    await attempt("network.latency gateway", () => bridge.call("network.latency", { target: "gateway" }));
    await attempt("network.latency again at once", () => bridge.call("network.latency", { target: "gateway" }));
    await new Promise((r) => setTimeout(r, 1200));
    await attempt("network.latency undeclared host", () => bridge.call("network.latency", { target: "example.com" }));
    await attempt("network.latency loopback undeclared", () => bridge.call("network.latency", { target: "127.0.0.1", port: 12346 }));
    await attempt("unknown method", () => bridge.call("fs.readFile", { path: "C:/Windows/win.ini" }));
    await attempt("prototype method", () => bridge.call("__proto__"));
    await attempt("fetch internet", () => fetch("https://example.invalid/").then((r) => r.status));
    await attempt("fetch loopback", () => fetch("http://127.0.0.1:1/").then((r) => r.status));
    window.__results = results;
    document.getElementById("out").textContent = JSON.stringify(results, null, 2);
    document.title = "selftest-done";
})();
