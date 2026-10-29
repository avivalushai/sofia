# Rubric: ai.prompt-injection — Prompt injection

Anything a visitor types, and anything the app reads (a web page, a document, an email), can contain instructions aimed at the model: "ignore your instructions and…". If the model follows them, it can leak the hidden instructions or other users' data, take actions it shouldn't, or say things in your name.

Read the code that builds prompts and calls the model, and any tools or actions the model can trigger.

1. **Is untrusted text kept apart from the instructions?**
   Fail: user input or fetched content pasted into the system prompt or the instruction text (`system: \`You are… ${userInput}\``); instructions and data in one string.
   Pass: instructions in the system message, untrusted text only in user messages or clearly fenced and labelled as data.
2. **Can the model's answer cause actions without a check?**
   Fail: tool calls or function results executed directly (sending email, deleting, paying, changing records, running code) based on what the model asked, with no allow-list or confirmation. Answer `pass` with "Doesn't apply:" when the model has no tools.
   Pass: only safe, limited tools; dangerous ones need the user's confirmation; arguments are validated.
3. **Is anything secret or other users' data within the model's reach?**
   Fail: API keys, other users' records, or private business data put in the prompt "for context", so a clever question can extract it.
   Pass: the prompt holds only what this user may see.
4. **Is the answer checked before it's shown or used?**
   Fail: the answer goes straight into the page as HTML or into a database or URL without checks (if `ai.output-as-code` covers the exact HTML case, mention it and judge the rest).
   Pass: shown as text, with limits on what it can trigger.

Findings: one for each place, with file and line. Options: (1) separate instructions from data and limit what the model can trigger (recommended); (2) add a confirmation step before any action; (3) keep it as it is.
