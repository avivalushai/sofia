import * as Sentry from "@sentry/browser";

Sentry.init({ dsn: "https://public@sentry.example/1", tracesSampleRate: 0.1 });
