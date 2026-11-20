// swift-tools-version: 5.9
// HealyxKit: the platform-neutral core of the Healyx Apple app.
// Models, health-score and lab-brief logic, and the client for the Healyx web API.
// It has no third-party dependencies, so it builds and tests on macOS and Linux.
import PackageDescription

let package = Package(
    name: "HealyxKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "HealyxKit", targets: ["HealyxKit"]),
    ],
    targets: [
        .target(name: "HealyxKit"),
        .testTarget(name: "HealyxKitTests", dependencies: ["HealyxKit"]),
    ]
)
