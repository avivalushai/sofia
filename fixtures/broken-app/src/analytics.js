// privacy.session-replay: Hotjar records the login page with nothing masked
// analytics.internal: analytics runs everywhere, including the owner's own visits
import Hotjar from "@hotjar/browser";

Hotjar.init(3712345, 6);
window.gtag("config", "G-TIDY123");
