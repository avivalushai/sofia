# Sofia — check your app before launch

Sofia is a plugin for Claude Code. Before you put your app in front of people, she goes through it the way a careful friend would: opens it in your browser, clicks the buttons, fills the forms, reads the code, and tells you in plain words what's broken and what can wait.

She doesn't change anything on her own. You see the report, talk it through with her, and she fixes only what you approve.

## What she checks

Things you probably didn't think to check:

- **Does it work?** Buttons that do nothing, forms that look sent but aren't, broken links, errors on the page
- **Phones and tablets** — text too small, things sliding off the screen, menus that don't open
- **Safety** — secret keys visible in the browser, an open database, missing security settings
- **First impression** — typos (Hebrew and English), what your link looks like when shared on WhatsApp, Google seeing your pages
- **Hebrew and right-to-left** — text direction, fonts, mixed Hebrew and English
- **Privacy** — cookies before consent, a privacy policy
- **Design** — too many fonts, colors and button styles

Every check runs the same way every time, so the same app gets the same report.

## Install

You need [Claude Code](https://claude.com/claude-code), [Google Chrome](https://www.google.com/chrome) and [Node.js](https://nodejs.org) 20 or newer. If you've ever run your app on your own computer, you most likely have Node already.

In Claude Code, type:

```
/plugin marketplace add avivalushai/sofia
/plugin install sofia@sofia
```

## Update

Sofia doesn't update herself unless you turn that on. To get the newest version, run these in your terminal:

```
claude plugin marketplace update sofia
claude plugin update sofia@sofia
```

Then restart Claude Code. Not comfortable with the terminal? Ask Claude: "update the Sofia plugin".

To get new versions automatically: type `/plugin` in Claude Code, open **Marketplaces**, choose **sofia** and turn on auto-update.

## Use

In your app's folder, ask Claude:

> Sofia, check my app

or type `/sofia:check`. For a quick check that takes seconds, type `/sofia:check quick`.

Sofia shows a summary in the chat and opens a full report page on your computer. When you're ready to fix things, tell her which ones, or type `/sofia:fix`.

## Your privacy

- Everything runs on your computer. Sofia doesn't send your code or your results anywhere.
- She only visits your own app: the local copy, or the live address you give her.
- Results are saved in a `.launch-check` folder inside your project.
- She won't submit real forms, send email or make purchases without asking you first.
- Before her first fix she saves a checkpoint, and each fix is saved separately, so any fix can be undone on its own.

## בעברית

סופיה היא תוסף ל-Claude Code שבודק את האפליקציה שלך לפני שמשיקים: לוחצת על הכפתורים, ממלאת טפסים, קוראת את הקוד, ומספרת במילים פשוטות מה שבור ומה יכול לחכות. היא לא משנה שום דבר בלי אישור שלך.

התקנה, בתוך Claude Code:

```
/plugin marketplace add avivalushai/sofia
/plugin install sofia@sofia
```

שימוש: בתיקייה של האפליקציה, כתבו ל-Claude ״סופיה, תבדקי לי את האפליקציה״.

צריך Google Chrome ו-Node.js בגרסה 20 ומעלה.

עדכון לגרסה חדשה: הריצו בטרמינל את שתי הפקודות שבסעיף Update למעלה ואז הפעילו מחדש את Claude Code, או פשוט בקשו מ-Claude: ״תעדכן את התוסף של סופיה״. לעדכון אוטומטי: `/plugin` ← Marketplaces ← sofia ← הפעלת auto-update.

## License

MIT
