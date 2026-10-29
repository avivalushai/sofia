// analytics only on the live site; no session recordings
if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") window.gtag?.("config", "G-TIDY123");
