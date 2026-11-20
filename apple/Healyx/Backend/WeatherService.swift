import Foundation
import CoreLocation
import Observation

/// Today's temperature for Home, from Open-Meteo (free, no key) and the
/// device's approximate location. Hidden when location is off.
@MainActor
@Observable
final class WeatherService {
    private(set) var temperatureF: Int?
    private(set) var symbol = "sun.max.fill"
    private(set) var isDenied = false

    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private let delegate = LocationDelegate()
    @ObservationIgnored private var lastFetch: Date?

    init() {
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        manager.delegate = delegate
        delegate.onAuthorization = { [weak self] status in
            Task { @MainActor in self?.handle(status) }
        }
        delegate.onLocation = { [weak self] latitude, longitude in
            Task { @MainActor in await self?.fetch(latitude: latitude, longitude: longitude) }
        }
    }

    /// Asks for location once, then loads the weather (at most every 20 minutes).
    func start() {
        if let lastFetch, Date().timeIntervalSince(lastFetch) < 20 * 60 { return }
        handle(manager.authorizationStatus)
    }

    private func handle(_ status: CLAuthorizationStatus) {
        switch status {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            isDenied = true
            temperatureF = nil
        default:
            isDenied = false
            manager.requestLocation()
        }
    }

    private struct Response: Decodable {
        struct Current: Decodable {
            let temperature_2m: Double
            let weather_code: Int
        }
        let current: Current
    }

    private func fetch(latitude: Double, longitude: Double) async {
        // Rounded location (about 1 km) so the time-of-day theme uses local sunrise and sunset.
        UserDefaults.standard.set((latitude * 100).rounded() / 100, forKey: "healyx.location.latitude")
        UserDefaults.standard.set((longitude * 100).rounded() / 100, forKey: "healyx.location.longitude")
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")
        // Rounded to about 1 km: enough for the weather.
        components?.queryItems = [
            URLQueryItem(name: "latitude", value: String(format: "%.2f", latitude)),
            URLQueryItem(name: "longitude", value: String(format: "%.2f", longitude)),
            URLQueryItem(name: "current", value: "temperature_2m,weather_code"),
            URLQueryItem(name: "temperature_unit", value: "fahrenheit"),
        ]
        guard let url = components?.url else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let response = try JSONDecoder().decode(Response.self, from: data)
            temperatureF = Int(response.current.temperature_2m.rounded())
            symbol = Self.symbol(for: response.current.weather_code)
            lastFetch = Date()
        } catch {
            // Weather is a nice-to-have; leave the chip hidden on failure.
        }
    }

    private static func symbol(for code: Int) -> String {
        switch code {
        case 0: return "sun.max.fill"
        case 1, 2, 3: return "cloud.sun.fill"
        case 45, 48: return "cloud.fog.fill"
        case 51...67: return "cloud.rain.fill"
        case 71...77, 85, 86: return "cloud.snow.fill"
        case 80...82: return "cloud.heavyrain.fill"
        case 95...99: return "cloud.bolt.rain.fill"
        default: return "cloud.fill"
        }
    }
}

/// CoreLocation's delegate, kept separate so the store stays a plain observable class.
private final class LocationDelegate: NSObject, CLLocationManagerDelegate {
    var onAuthorization: ((CLAuthorizationStatus) -> Void)?
    var onLocation: ((Double, Double) -> Void)?

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        onAuthorization?(manager.authorizationStatus)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        onLocation?(location.coordinate.latitude, location.coordinate.longitude)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}
