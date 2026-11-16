//
//  ConcurrencyExamples.swift
//  Swift Learning Guide → Concurrency
//
//  Every example from the guide, made runnable. From this folder, run:
//
//      swift ConcurrencyExamples.swift
//
//  The "network" is fake: it just waits. Watch the timestamps on the left
//  to see what runs one after another and what runs at the same time.
//  Section numbers match the sections in the guide.
//

import Foundation

// MARK: - Helpers: fake network + timestamped log

enum FakeNetwork {
    /// How long each fake download takes. Same numbers as the guide's figures.
    static let seconds: [String: Double] = ["IMG001": 1.0, "IMG99": 2.0, "IMG0404": 1.5]
}

enum Stopwatch {
    static let start = ContinuousClock.now
}

func secs(_ d: Duration) -> String {
    String(format: "%.1fs", Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18)
}

func log(_ message: String) {
    print("[\(secs(Stopwatch.start.duration(to: .now)))] \(message)")
}

func section(_ title: String) {
    print("\n── \(title) " + String(repeating: "─", count: max(0, 64 - title.count)))
}

/// Waits like a network call. The wait runs in its own unstructured Task, and an
/// unstructured task is NOT cancelled when its creator is (see section 7).
/// So, like the book's downloadPhoto(named:), a download that already started
/// always runs to the end.
func networkDelay(_ seconds: Double) async {
    await Task { try? await Task.sleep(for: .seconds(seconds)) }.value
}

func listPhotos(inGallery name: String) async -> [String] {
    await networkDelay(0.5)
    return ["IMG001", "IMG99", "IMG0404"]
}

func downloadPhoto(named name: String) async -> Data {
    await networkDelay(FakeNetwork.seconds[name, default: 1.0])
    return Data(name.utf8)
}

func label(_ photo: Data) -> String { String(decoding: photo, as: UTF8.self) }

@MainActor
func show(_ photo: Data) {
    log("show(\(label(photo))) runs on the main actor")
}

@MainActor
func show(_ photos: [Data]) {
    log("show(\(photos.map(label))) runs on the main actor")
}

// MARK: - 2 · Async functions and await

func example2_suspensionPoints() async {
    section("2 · async/await: every await is a possible suspension point")
    log("await listPhotos… (suspends; other code may use this thread)")
    let photoNames = await listPhotos(inGallery: "Summer Vacation")
    log("resumed with \(photoNames)")

    let sortedNames = photoNames.sorted()   // plain synchronous code: can't suspend here
    let name = sortedNames[0]

    log("await downloadPhoto(\(name))… (suspends again)")
    let photo = await downloadPhoto(named: name)
    await show(photo)                        // hop to the main actor (section 9)
}

// MARK: - 3 · Async sequences

/// A tiny AsyncSequence: hands out one photo name every half second.
/// (The book's version reads lines from standard input, which would wait for you to type.)
func photoFeed() -> AsyncStream<String> {
    AsyncStream { continuation in
        Task {
            for name in ["IMG001", "IMG99", "IMG0404"] {
                try? await Task.sleep(for: .milliseconds(500))
                continuation.yield(name)
            }
            continuation.finish()
        }
    }
}

func example3_asyncSequence() async {
    section("3 · Async sequences: for await handles each element as it arrives")
    for await name in photoFeed() {
        log("got \(name)")
    }
    log("sequence finished")
}

// MARK: - 4 · Calling async functions in parallel

func example4_asyncLet() async {
    section("4 · One by one with await vs together with async let")
    let photoNames = await listPhotos(inGallery: "Summer Vacation")
    let clock = ContinuousClock()

    let oneByOne = await clock.measure {
        let firstPhoto = await downloadPhoto(named: photoNames[0])
        let secondPhoto = await downloadPhoto(named: photoNames[1])
        let thirdPhoto = await downloadPhoto(named: photoNames[2])
        _ = [firstPhoto, secondPhoto, thirdPhoto]
    }
    log("await, one by one: \(secs(oneByOne))   (1.0 + 2.0 + 1.5)")

    let together = await clock.measure {
        async let firstPhoto = downloadPhoto(named: photoNames[0])
        async let secondPhoto = downloadPhoto(named: photoNames[1])
        async let thirdPhoto = downloadPhoto(named: photoNames[2])
        let photos = await [firstPhoto, secondPhoto, thirdPhoto]
        await show(photos)
    }
    log("async let, together: \(secs(together))   (the slowest one: 2.0)")
}

// MARK: - 5 · Tasks and task groups

func example5_taskGroup() async {
    section("5 · Task group: results come back in the order they finish")
    let photos = await withTaskGroup(of: Data.self) { group in
        let photoNames = await listPhotos(inGallery: "Summer Vacation")
        for name in photoNames {
            group.addTask {
                log("child task started: \(name)")
                return await downloadPhoto(named: name)
            }
        }

        var results: [Data] = []
        for await photo in group {
            log("child task finished: \(label(photo))")
            results.append(photo)
        }
        return results
    }
    log("added IMG001, IMG99, IMG0404 → got back \(photos.map(label))")
}

// MARK: - 6 · Task cancellation

func example6_cancellation() async {
    section("6 · Cooperative cancellation returns a partial result")
    let gallery = ["IMG001", "IMG002", "IMG003", "IMG004", "IMG005", "IMG006"]

    let task = Task {
        await withTaskGroup { group in
            for name in gallery {
                let added = group.addTaskUnlessCancelled {
                    Task.isCancelled ? nil : await downloadPhoto(named: name)
                }
                guard added else {
                    log("addTaskUnlessCancelled(\(name)) → false, stop adding")
                    break
                }
                log("added \(name)")
                // Slow the loop down so the cancel lands in the middle of it.
                try? await Task.sleep(for: .milliseconds(400))
            }

            var results: [Data] = []
            for await photo in group {
                if let photo { results.append(photo) }
            }
            return results
        }
    }

    try? await Task.sleep(for: .seconds(1.3))
    log("task.cancel()")
    task.cancel()
    let photos = await task.value
    log("kept \(photos.count) of \(gallery.count): \(photos.map(label))  (downloads already running finished)")
}

func example6b_cancellationHandler() async {
    section("6 · withTaskCancellationHandler hears about it immediately")
    let task = Task {
        await withTaskCancellationHandler {
            log("operation: starting a 5s job")
            try? await Task.sleep(for: .seconds(5))   // Task.sleep checks for cancellation itself
            log("operation: stopped early, Task.isCancelled = \(Task.isCancelled)")
        } onCancel: {
            log("onCancel: Canceled!")
        }
    }
    try? await Task.sleep(for: .milliseconds(500))
    task.cancel()
    await task.value
}

// MARK: - 7 · Unstructured concurrency

enum Request {
    @TaskLocal static var id = "none"
}

func isolationName(_ actor: isolated (any Actor)? = #isolation) -> String {
    actor == nil ? "nonisolated" : "MainActor"
}

@MainActor
func example7_unstructured() async {
    section("7 · Task {} vs Task.detached")
    let handle = Task {
        await downloadPhoto(named: "IMG001")
    }
    let result = await handle.value
    log("let result = await handle.value → \(label(result))")

    await Request.$id.withValue("A1") {
        log("creator:       isolation \(isolationName()), requestID \(Request.id)")
        await Task {
            log("Task {}        isolation \(isolationName()), requestID \(Request.id)   ← inherited")
        }.value
        await Task.detached {
            log("Task.detached  isolation \(isolationName()), requestID \(Request.id)   ← inherits nothing")
        }.value
    }
}

// MARK: - 8 · Isolation: a data race, then the same work behind an actor

/// DON'T do this in real code. `@unchecked Sendable` tells the compiler
/// "trust me, this is safe". It isn't, so Swift can't protect it.
final class UnsafeCounter: @unchecked Sendable {
    var value = 0
}

actor SafeCounter {
    var value = 0
    func increment() { value += 1 }
}

func example8_dataRace() async {
    section("8 · Data race vs actor (10 tasks × 10,000 increments)")
    let unsafe = UnsafeCounter()
    await withTaskGroup(of: Void.self) { group in
        for _ in 0..<10 {
            group.addTask {
                for _ in 0..<10_000 { unsafe.value += 1 }   // read, add, write: tasks can overlap
            }
        }
    }

    let safe = SafeCounter()
    await withTaskGroup(of: Void.self) { group in
        for _ in 0..<10 {
            group.addTask {
                for _ in 0..<10_000 { await safe.increment() }   // one increment at a time
            }
        }
    }
    log("expected 100000 · unsafe class: \(unsafe.value) · actor: \(await safe.value)")
}

// MARK: - 9 · The main actor

func downloadAndShowPhoto(named name: String) async {
    let photo = await downloadPhoto(named: name)   // runs off the main actor
    await show(photo)                              // switching to the main actor needs await
}

func example9_mainActor() async {
    section("9 · Work in the background, then hop to the main actor")
    await downloadAndShowPhoto(named: "IMG0404")

    let photo = await downloadPhoto(named: "IMG99")
    Task { @MainActor in
        show(photo)        // already on the main actor inside here: no await
    }
    try? await Task.sleep(for: .milliseconds(50))   // that Task isn't awaited; give it a moment
}

// MARK: - 10 · Actors

actor TemperatureLogger {
    let label: String
    var measurements: [Int]
    private(set) var max: Int

    init(label: String, measurement: Int) {
        self.label = label
        self.measurements = [measurement]
        self.max = measurement
    }
}

extension TemperatureLogger {
    func update(with measurement: Int) {
        measurements.append(measurement)   // max is briefly out of date here…
        if measurement > max {
            max = measurement              // …but no await, so nobody can see it
        }
    }

    func convertFahrenheitToCelsius() {
        for i in measurements.indices {
            measurements[i] = (measurements[i] - 32) * 5 / 9
        }
    }
}

func example10_actors() async {
    section("10 · Actors: one task at a time inside")
    let logger = TemperatureLogger(label: "Outdoors", measurement: 25)
    log("await logger.max → \(await logger.max)")
    // print(logger.max)   // ❌ Uncomment to see the compile error: actor state needs await.

    await withTaskGroup(of: Void.self) { group in
        for temperature in [31, 18, 27, 40, 22] {
            group.addTask { await logger.update(with: temperature) }
        }
    }
    log("measurements \(await logger.measurements), max \(await logger.max)")
}

// MARK: - 11 · Global actors

@globalActor
actor PhotoLibraryActor {
    static let shared = PhotoLibraryActor()
}

@PhotoLibraryActor
enum PhotoLibrary {
    static var saved: [String] = []
    static func save(_ name: String) { saved.append(name) }
}

func example11_globalActor() async {
    section("11 · A global actor of your own")
    await PhotoLibrary.save("IMG001")
    await PhotoLibrary.save("IMG99")
    log("@PhotoLibraryActor state: \(await PhotoLibrary.saved)")
}

// MARK: - 12 · Sendable types

struct TemperatureReading: Sendable {
    var measurement: Int
}

extension TemperatureLogger {
    func addReading(from reading: TemperatureReading) {
        measurements.append(reading.measurement)
    }
}

struct FileDescriptor {
    let rawValue: Int
}

@available(*, unavailable)
extension FileDescriptor: Sendable {}

func example12_sendable() async {
    section("12 · Sendable values cross into the actor")
    let logger = TemperatureLogger(label: "Tea kettle", measurement: 85)
    let reading = TemperatureReading(measurement: 45)
    await logger.addReading(from: reading)
    log("Tea kettle measurements: \(await logger.measurements)")
}

// MARK: - Run everything, in guide order

await example2_suspensionPoints()
await example3_asyncSequence()
await example4_asyncLet()
await example5_taskGroup()
await example6_cancellation()
await example6b_cancellationHandler()
await example7_unstructured()
await example8_dataRace()
await example9_mainActor()
await example10_actors()
await example11_globalActor()
await example12_sendable()
print("\nDone.")
