import Foundation

/// The one-line summary at the top of Home, written from today's scores.
public enum WellnessSummary {
    public static func greeting(firstName: String?, now: Date, calendar: Calendar = .current) -> String {
        let hour = calendar.component(.hour, from: now)
        let part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
        if let firstName, !firstName.isEmpty { return "\(part), \(firstName)." }
        return "\(part)."
    }

    /// A greeting plus one or two plain sentences about sleep and recovery (or stress).
    public static func sentence(snapshot: WellnessSnapshot?, firstName: String?, now: Date,
                                calendar: Calendar = .current) -> String {
        let hello = greeting(firstName: firstName, now: now, calendar: calendar)
        guard let snapshot, !snapshot.isEmpty else {
            return hello + " Connect Apple Health to see your sleep, recovery and stress for today."
        }
        var parts: [String] = []
        if let sleep = snapshot.sleep {
            let slept = duration(sleep.asleepMinutes)
            if sleep.metGoal {
                parts.append("You hit your sleep goal with \(slept).")
            } else {
                parts.append("You slept \(slept), short of your \(duration(sleep.needMinutes)) goal.")
            }
        }
        if let recovery = snapshot.recovery, let today = recovery.hrvToday, let usual = recovery.hrvBaseline, usual > 0 {
            let ratio = today / usual
            if ratio >= 1.05 {
                parts.append("HRV is above your usual, so recovery looks solid.")
            } else if ratio <= 0.95 {
                parts.append("HRV is below your usual, so it may be a day to take it easier.")
            } else {
                parts.append("HRV is right around your usual.")
            }
        } else if let recovery = snapshot.recovery {
            parts.append("Recovery is at \(recovery.score)% today.")
        } else if let stress = snapshot.stress {
            parts.append("Stress is \(stress.level.lowercased()) so far today.")
        }
        if parts.isEmpty, let nutrition = snapshot.nutrition {
            parts.append("You've logged \(Int(nutrition.energyKcal.rounded())) kcal today.")
        }
        return ([hello] + parts.prefix(2)).joined(separator: " ")
    }

    /// "7h 12m", "45m", "8h".
    public static func duration(_ minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        if h == 0 { return "\(m)m" }
        return m == 0 ? "\(h)h" : "\(h)h \(m)m"
    }
}
