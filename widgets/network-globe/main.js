(async () => {
    const out = document.getElementById("out");
    try {
        const info = await window.labyrispaceWidget.call("host.info");
        out.textContent = JSON.stringify(info, null, 2);
    } catch (e) {
        out.textContent = "Host error: " + e.message;
    }
})();
