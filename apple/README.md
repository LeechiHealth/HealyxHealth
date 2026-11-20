# Healyx for iPhone, iPad and Mac (SwiftUI)

A native Swift app for Healyx. One codebase builds for iPhone, iPad and Mac. It uses the **same account, database and AI** as the website:

```
 Healyx app (SwiftUI)
   ├── Sign-in + your records ──► Supabase (same project, same row-level security)
   └── Guide chat + Agents ─────► healyx-health.vercel.app/api/* (same routes, your login token)
```

Nothing on the server changes. If you add or edit a record in the app, it shows up on the website, and the reverse is true too.

## What's in v1

| Section | What it does |
|---|---|
| **Overview** | Lab signals (in range / flagged / unknown), changes since the last result, "Understand this" (asks the guide), record at a glance, and the optional cardiometabolic snapshot. It uses the same scoring code as the web, ported and unit-tested. |
| **Health Records** | Labs (grouped, with full history per marker), vitals, medications, conditions. You can add, edit and delete. Swipe to delete on iPhone; right-click on Mac. |
| **Health Guide** | The chat from the website. The server adds your saved records to every question. |
| **Agents** | Appointments, Medications, Research and Shopping, with their own chat history and the shared task queue. You see each agent's steps live while it works (web searches, label lookups), and the web sources it read. **Add to Calendar** writes reminders straight into Apple Calendar (write-only: the app can't read your calendar). Drafts have Copy and Share. |

Still website-only: Research search, lab photo/PDF upload, documents, the protocol and cognitive pages. **Next up: Apple Health (HealthKit)** sync, after the first TestFlight build.

## First run on your Mac

1. **Install Xcode** from the Mac App Store (free; a large download). Open it once and let it install the iOS components.
2. **Open the project:** double-click `apple/Healyx.xcodeproj`. Xcode downloads the Supabase package on its own. This takes a minute or two the first time.
3. **Choose where it runs** (the device menu at the top of the window):
   - **An iPhone simulator.** No signing setup needed. Press **⌘R**.
   - **My Mac.** Click the Healyx project, then the Healyx target, then **Signing & Capabilities**. Under **Team**, choose **Add an Account…** and sign in with your Apple ID, then pick your *Personal Team*. Press **⌘R**.
   - **Your iPhone.** Plug it in. On the phone, turn on **Settings › Privacy & Security › Developer Mode**. Use the same Personal Team, then press **⌘R**. Free Personal Team installs expire after 7 days. The $99/yr Apple Developer Program removes that limit and unlocks TestFlight.
4. Sign in with your normal Healyx email and password.

If Xcode says the bundle identifier is unavailable, change `health.healyx.app` to something unique (for example `health.healyx.app.kenny`) on the same Signing screen.

## Let Claude build and fix it on your Mac

Apple's official Xcode plugin for Claude Code lets Claude build the app, read the errors, render previews and drive the simulator:

```bash
claude plugin install xcode@claude-plugins-official
```

Then open Claude Code in `HealyxHealth/apple` and ask it to "build Healyx for the iPhone simulator and fix any errors".

## Layout

```
apple/
  Healyx.xcodeproj        Xcode project (one multiplatform target: iOS 17+, macOS 14+)
  Healyx/                 App target (SwiftUI)
    App/                  Entry point, AppConfig (Supabase URL/key, API base URL)
    Backend/              SessionStore, RecordsStore, ChatStore, AgentsStore, CalendarService
    Design/               Theme (web design tokens), shared styles
    Views/                Overview, Records, Chat, Agents
    Assets.xcassets       App icon, accent color, Healyx mark
  HealyxKit/              Swift package: models, score + lab brief logic, API client (no UI)
    Tests/                24 unit tests (run with `cd apple/HealyxKit && swift test`)
  project.yml             XcodeGen fallback if the project ever fails to open
```

## Notes

- **Keys:** `AppConfig.swift` holds the Supabase *publishable* key. It is meant to ship in apps, and it's already in the website's JavaScript. Row-level security protects each person's data. Never put a service-role or Groq key in the app.
- **AI errors:** chat and agents run on the server. If the server's AI model is down or misconfigured, the app shows the server's own error message.
- **Units:** you enter weight in lb and temperature in °F. They're saved to the `weight_kg` and `temperature_celsius` columns already converted.
- **Swift language mode:** Swift 5, to keep the first build smooth. Move to Swift 6 strict concurrency later.
