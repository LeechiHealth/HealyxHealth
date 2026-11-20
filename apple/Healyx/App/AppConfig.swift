import Foundation

/// Where the native app connects. These are the same services the website uses.
enum AppConfig {
    /// Supabase project (auth + database) shared with the web app.
    static let supabaseURL = URL(string: "https://pniiscbwnrlwrckllwzq.supabase.co")!

    /// Supabase publishable key. It is meant to ship inside apps (it is already in the
    /// website's JavaScript); row-level security is what protects each person's rows.
    static let supabaseKey = "sb_publishable_lnWxYeIp0S2mSJQrZXdwcw_1bDL0i7b"

    /// The deployed Healyx web app. The native app calls its API routes
    /// (/api/chat, /api/agents/run) with the signed-in person's token.
    /// Change this when the custom domain goes live.
    static let apiBaseURL = URL(string: "https://healyx-health.vercel.app")!
}
