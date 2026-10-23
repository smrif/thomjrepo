import XCTest

@MainActor
final class NativeExportQATests: XCTestCase {
    private func picture(_ app: XCUIApplication, _ name: String) {
        let picture = XCTAttachment(screenshot: app.screenshot())
        picture.name = name
        picture.lifetime = .keepAlways
        add(picture)
    }
    private func tap(_ app: XCUIApplication, _ name: String) {
        let button = app.buttons[name].firstMatch
        let found = button.waitForExistence(timeout: 20)
        if !found { picture(app, "Missing control: " + name); print(String(app.debugDescription.prefix(24000))) }
        XCTAssertTrue(found, name)
        for _ in 0..<5 { if button.isHittable { break }; app.webViews.firstMatch.swipeUp() }
        XCTAssertTrue(button.isHittable, "Unreachable control: " + name)
        button.tap()
    }
    private func text(_ app: XCUIApplication, _ value: String) {
        let found = app.staticTexts[value].firstMatch.waitForExistence(timeout: 30)
        if !found {
            picture(app, "Missing UI result: " + value)
            print("UI_CHECK_FAILURE_BEGIN\n" + String(app.debugDescription.prefix(18000)) + "\nUI_CHECK_FAILURE_END")
        }
        XCTAssertTrue(found, value)
    }
    private func cancelFiles(_ app: XCUIApplication, _ name: String, swipe: Bool = false) {
        if swipe {
            let bar = app.navigationBars.firstMatch
            XCTAssertTrue(bar.waitForExistence(timeout: 15))
            picture(app, name)
            let start = bar.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
            start.press(forDuration: 0.1, thenDragTo: end)
            return
        }
        let cancel = app.buttons["Cancel"].firstMatch
        let browse = app.buttons["Browse"].firstMatch
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            cancel.exists || browse.exists
        }, object: app)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 20), .completed, "Files picker did not appear")
        if !cancel.exists {
            XCTAssertTrue(browse.exists)
            browse.tap()
        }
        let found = cancel.waitForExistence(timeout: 10)
        picture(app, name)
        print("SYSTEM_PICKER_BUTTONS " + app.buttons.allElementsBoundByIndex.map(\.label).joined(separator: " | "))
        XCTAssertTrue(found, "Files cancellation control missing")
        cancel.tap()
    }
    private func cancelShare(_ app: XCUIApplication, _ name: String) {
        let close = app.buttons["Close"].firstMatch
        let cancel = app.buttons["Cancel"].firstMatch
        let found = close.waitForExistence(timeout: 15) || cancel.waitForExistence(timeout: 5)
        picture(app, name)
        print("SYSTEM_SHARE_BUTTONS " + app.buttons.allElementsBoundByIndex.map(\.label).joined(separator: " | "))
        XCTAssertTrue(found, "Share cancellation control missing")
        if close.exists { close.tap() } else { cancel.tap() }
    }
    private func preparedApp() -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.whoseday.feasibility")
        app.launchArguments = ["--lab-reports-write"]
        app.launch()
        text(app, "Synthetic report fixture ready")
        app.terminate()
        app.launchArguments = ["--lab-reports-read"]
        app.launch()
        text(app, "Synthetic reports ready for QA.")
        return app
    }
    private func tapPrefix(_ app: XCUIApplication, _ prefix: String) {
        let button = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
        let found = button.waitForExistence(timeout: 20)
        if !found { picture(app, "Missing choice: " + prefix); print(String(app.debugDescription.prefix(24000))) }
        XCTAssertTrue(found, prefix)
        button.tap()
    }
    private func finishTyping(_ app: XCUIApplication) {
        let done = app.toolbars.buttons["Done"].firstMatch
        if done.exists && done.isHittable { done.tap() }
        text(app, "Setup progress saved on this device.")
    }
    func testOnboardingColdReopen() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.whoseday.feasibility")
        app.launchArguments = ["--lab-onboarding-write"]; app.launch()
        tap(app, "Create an account")
        text(app, "What should we call you?")
        picture(app, "Native onboarding name field")
        let parent = app.textFields["Your name or label"].firstMatch
        XCTAssertTrue(parent.waitForExistence(timeout: 15)); parent.tap(); parent.typeText("Native Onboarding Parent")
        finishTyping(app)
        picture(app, "Name before continuing")
        tap(app, "Continue"); text(app, "Who is your co-parent?")
        let coparent = app.textFields["Co-parent name or label"].firstMatch
        XCTAssertTrue(coparent.waitForExistence(timeout: 15)); coparent.tap(); coparent.typeText("Other Parent")
        finishTyping(app)
        tap(app, "Continue"); text(app, "Who are your children?")
        let children = app.textViews["Children, one name per line"].firstMatch
        XCTAssertTrue(children.waitForExistence(timeout: 15)); children.tap(); children.typeText("Avery\nSam")
        finishTyping(app)
        picture(app, "Unfinished native onboarding draft")
        app.terminate(); app.launchArguments = ["--lab-onboarding-read"]; app.launch()
        tap(app, "Create an account")
        text(app, "Who are your children?")
        XCTAssertTrue(children.waitForExistence(timeout: 15)); XCTAssertEqual(children.value as? String, "Avery\nSam")
        tap(app, "Continue"); text(app, "What does everyday life include?")
        picture(app, "Native onboarding activities")
        tap(app, "Continue")
        let email = app.textFields["Email address"].firstMatch
        XCTAssertTrue(email.waitForExistence(timeout: 15)); email.tap(); email.typeText("parent-a@example.invalid")
        finishTyping(app)
        tap(app, "Terms of Use"); text(app, "Terms of Use"); tap(app, "Back")
        let agreement = app.staticTexts["I agree to the Terms of Use and acknowledge the Privacy Policy."].firstMatch
        XCTAssertTrue(agreement.waitForExistence(timeout: 15))
        for _ in 0..<5 { if agreement.isHittable { break }; app.webViews.firstMatch.swipeUp() }
        agreement.tap()
        picture(app, "Native onboarding explicit agreement")
        tap(app, "Send sign-up link")
        text(app, "Check your email on this device. Open the newest link to verify your account and finish setup. Your answers are saved.")
        let resend = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Send a new sign-up link")).firstMatch
        XCTAssertTrue(resend.exists); XCTAssertFalse(resend.isEnabled)
        picture(app, "Native onboarding awaiting synthetic verification")
        // The DEBUG fixture delivers the synthetic identity on the next launch,
        // proving that pending submission survives termination before verification.
        app.terminate(); app.launch()
        text(app, "Ready to log today")
        picture(app, "Native onboarding complete")
        app.terminate(); app.launch()
        text(app, "Ready to log today")
        XCTAssertFalse(app.buttons["Create an account"].firstMatch.exists)
        picture(app, "Native completed account cold reopen")
    }
    func testPhotoAttachmentColdReopen() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.whoseday.feasibility")
        app.launchArguments = ["--lab-photo-write"]; app.launch()
        text(app, "Synthetic photo fixture ready.")
        let edit = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Edit today")).firstMatch
        XCTAssertTrue(edit.waitForExistence(timeout: 20)); edit.tap()
        tapPrefix(app, "My day"); tapPrefix(app, "With me")
        tapPrefix(app, "Yes,"); tap(app, "No")
        tap(app, "Add screenshot")
        let cancel = app.buttons["Cancel"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 20))
        picture(app, "Native Photos picker before cancellation")
        cancel.tap()
        XCTAssertTrue(app.buttons["Add screenshot"].firstMatch.waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Add screenshot"].firstMatch.isHittable, "Cancelling photos must unlock the draft")
        tap(app, "Add screenshot")
        XCTAssertTrue(cancel.waitForExistence(timeout: 20))
        picture(app, "Photos picker swipe dismissal")
        let bar = app.navigationBars.firstMatch
        XCTAssertTrue(bar.exists)
        let grabber = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: bar.frame.midX, dy: bar.frame.minY - 6))
        grabber.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95)))
        let unlocked = app.buttons["Add screenshot"].firstMatch.waitForExistence(timeout: 15)
        if !unlocked { picture(app, "Photos swipe result"); print("PHOTO_SWIPE_RESULT\n" + String(app.debugDescription.prefix(24000))) }
        XCTAssertTrue(unlocked, "Swiping photos closed must unlock the draft")
        tap(app, "Add screenshot")
        XCTAssertTrue(cancel.waitForExistence(timeout: 20))
        print("PHOTO_PICKER_UI_BEGIN\n" + String(app.debugDescription.prefix(24000)) + "\nPHOTO_PICKER_UI_END")
        picture(app, "Native Photos picker with seeded image")
        let photo = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Photo")).firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 15), "Seeded photo must be available")
        photo.tap()
        let preview = app.images["Attached screenshot"].firstMatch
        let selected = preview.waitForExistence(timeout: 20)
        if !selected { picture(app, "Photo selection result"); print("PHOTO_SELECTION_RESULT\n" + String(app.debugDescription.prefix(24000))) }
        XCTAssertTrue(selected)
        picture(app, "Selected image in diary draft")
        tap(app, "Log it →"); text(app, "Synthetic photo save checkpoint ready.")
        app.terminate(); app.launchArguments = ["--lab-photo-read"]; app.launch()
        text(app, "Synthetic photo cold-reopen verified.")
        XCTAssertTrue(preview.waitForExistence(timeout: 15))
        picture(app, "Selected image after cold reopen")
        let remove = app.buttons["Remove screenshot"].firstMatch
        XCTAssertTrue(remove.waitForExistence(timeout: 15)); XCTAssertTrue(remove.isHittable)
        // The WebKit button is already visible. Tap its center without asking
        // XCTest to rediscover nested WebView interruptions a second time.
        let frame = remove.frame
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: frame.midX, dy: frame.midY)).tap()
        XCTAssertTrue(app.buttons["Add screenshot"].firstMatch.waitForExistence(timeout: 15))
        XCTAssertFalse(preview.exists, "Remove must clear the draft preview")
        // Abandon the removal draft: it must not erase the already saved image.
        app.terminate(); app.launch()
        text(app, "Synthetic photo cold-reopen verified.")
        XCTAssertTrue(preview.waitForExistence(timeout: 15))
        picture(app, "Saved image survives abandoned removal draft")
    }
    func testLocalBackupRoundTrip() throws {
        let app = preparedApp()
        let originalNote = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "END-LONG-NOTE")).firstMatch.label
        tap(app, "Settings"); tap(app, "Download full backup"); tap(app, "Save backup to Files (.json)")
        // Use the observed provider root, not the navigation bar's own label.
        let local = app.otherElements.matching(NSPredicate(format: "identifier BEGINSWITH %@", "DOC.browsingRoot Source: com.apple.FileProvider.LocalStorage")).firstMatch
        if !local.waitForExistence(timeout: 10) {
            let browse = app.buttons["Browse"].firstMatch
            if browse.exists { browse.tap() }
            let place = app.staticTexts["On My iPhone"].firstMatch
            picture(app, "Choose simulator-local storage")
            print("LOCAL_DESTINATION_UI\n" + String(app.debugDescription.prefix(14000)))
            XCTAssertTrue(place.waitForExistence(timeout: 10), "Choose only simulator-local storage")
            place.tap()
        }
        XCTAssertTrue(local.waitForExistence(timeout: 10), "Local Files destination is required")
        let stem = "whose-day-backup-uiqa-" + UUID().uuidString.prefix(8)
        let file = app.textFields.matching(NSPredicate(format: "value BEGINSWITH %@", "whose-day-backup-")).firstMatch
        picture(app, "Local JSON save before filename edit")
        print("LOCAL_SAVE_FIELDS " + app.textFields.allElementsBoundByIndex.map { $0.label + ":" + String(describing: $0.value) }.joined(separator: " | "))
        XCTAssertTrue(file.waitForExistence(timeout: 10))
        let count = (file.value as? String)?.count ?? 0
        file.tap(); file.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: count) + stem)
        XCTAssertTrue((file.value as? String)?.hasPrefix(stem) == true)
        tap(app, "Save"); text(app, "Backup saved to the location you chose. Keep the file safe.")
        tap(app, "Back to Settings"); tap(app, "Restore from backup"); tap(app, "Choose backup from Files")
        var saved = app.cells.matching(NSPredicate(format: "identifier BEGINSWITH %@", stem)).firstMatch
        if !saved.waitForExistence(timeout: 5) {
            let browse = app.tabBars.buttons["Browse"].firstMatch
            if browse.exists { browse.tap() }
            let place = app.staticTexts["On My iPhone"].firstMatch
            if place.exists { place.tap() }
            saved = app.cells.matching(NSPredicate(format: "identifier BEGINSWITH %@", stem)).firstMatch
        }
        picture(app, "Local JSON backup in Files")
        XCTAssertTrue(saved.waitForExistence(timeout: 20), "Saved backup must exist in the chosen local provider")
        XCTAssertTrue(saved.isEnabled); XCTAssertTrue(saved.images.firstMatch.exists)
        saved.images.firstMatch.tap(); text(app, "Preview ready. Nothing has been changed."); text(app, "8 dated records · 1 screenshots")
        picture(app, "JSON read-back preview")
        tap(app, "Cancel")
        tap(app, "Back to Settings"); tap(app, "Reports")
        let notes = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "Diary notes only")).firstMatch
        XCTAssertTrue(notes.waitForExistence(timeout: 10)); notes.tap()
        let currentNote = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "END-LONG-NOTE")).firstMatch
        XCTAssertTrue(currentNote.waitForExistence(timeout: 10)); XCTAssertEqual(currentNote.label, originalNote)
    }
    func testSystemSheetCancellation() throws {
        let app = preparedApp()
        let note = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "END-LONG-NOTE")).firstMatch
        XCTAssertTrue(note.exists)
        let before = note.label
        tap(app, "Save PDF"); cancelFiles(app, "PDF Files picker"); text(app, "PDF save cancelled.")
        tap(app, "Share PDF"); cancelShare(app, "PDF share sheet"); text(app, "Sharing cancelled.")
        tap(app, "Settings"); tap(app, "Export all data (CSV)")
        tap(app, "Save CSV to Files"); cancelFiles(app, "CSV Files picker swipe dismissal", swipe: true); text(app, "CSV export cancelled.")
        tap(app, "Share CSV"); cancelShare(app, "CSV share sheet"); text(app, "CSV export cancelled.")
        tap(app, "Back to Settings"); tap(app, "Download full backup")
        tap(app, "Save backup to Files (.json)"); cancelFiles(app, "JSON backup Files picker"); text(app, "Backup export cancelled.")
        tap(app, "Back to Settings"); tap(app, "Restore from backup")
        tap(app, "Choose backup from Files"); cancelFiles(app, "JSON import Files picker"); text(app, "No backup selected.")
        picture(app, "Recovered import screen after cancellation")
        tap(app, "Back to Settings"); tap(app, "Reports")
        let notes = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "Diary notes only")).firstMatch
        XCTAssertTrue(notes.waitForExistence(timeout: 10)); notes.tap()
        XCTAssertTrue(note.waitForExistence(timeout: 10)); XCTAssertEqual(note.label, before, "Cancellation changed the saved report")
    }
}
