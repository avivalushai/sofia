# Rubric: content.button-labels — Unclear button labels

A button or link should say what will happen when it's pressed. "Submit", "Click here", "OK", "Go" or "Send" make people stop and guess. That costs sign-ups, and screen-reader users, who often hear only the list of links, get no context at all.

Read the files you were given, including the pages' visible text if it's listed. Look at every button and every link that works like a button.

1. **Do the buttons say what they do?**
   Fail: a main action labelled only "Submit", "Send", "OK", "Go", "Continue", "Click", "שליחה", "אישור", "המשך" or "לחץ", when the action isn't plain from the label alone (what is sent? what continues?).
   Pass: "Send message", "Start free trial", "Book a call", "Save changes", "שליחת ההודעה", "להתחלת ניסיון חינם". A short label is fine when the context makes it plain, like "Search" next to a search box, "Log in" on a login form, or "Next" inside a numbered wizard.
2. **Are there links like "click here", "here" or "read more" whose text says nothing on its own?**
   Fail: "click here", "here", "לחצו כאן", "כאן", "קרא עוד" with no context in the link itself.
   Pass: the link text names where it goes ("Contact us", "Read the pricing guide").
3. **Does the same action have the same label everywhere?**
   Fail: the same sign-up action is "Join" in one place and "Register" in another (if `content.terms` already covers this exact pair, answer `pass` and say so).
   Pass: one action, one label.

Findings: one for each unclear label, with file and line (or the page text line). Options: (1) a label that names the action, with a suggested text (recommended); (2) keep the label and add context next to it; (3) keep it as it is (the context makes it plain).
