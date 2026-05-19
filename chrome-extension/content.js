(() => {
  const scriptId = "codex-xuexitong-script-1x";
  if (document.getElementById(scriptId)) return;

  console.log("[Xuexitong Script 1x] content script injecting page script");
  const script = document.createElement("script");
  script.id = scriptId;
  script.src = chrome.runtime.getURL("v3_optimized.user.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
})();
