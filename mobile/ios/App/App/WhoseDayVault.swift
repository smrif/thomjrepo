import Capacitor
import SQLite3
import Security
import UIKit
import CoreText
import UniformTypeIdentifiers
import PhotosUI
import ImageIO

@objc(WhoseDayVaultPlugin)
public class WhoseDayVaultPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate, PHPickerViewControllerDelegate {
    public let identifier = "WhoseDayVaultPlugin"
    public let jsName = "WhoseDayVault"
    public let pluginMethods: [CAPPluginMethod] = {
        var names = ["write", "read", "keys", "writeSecret", "readSecret", "removeSecret", "makeReport", "compareBatch", "exportBackup", "importBackup", "makeTextFile", "saveExport", "copyText", "pickImage"]
        #if DEBUG
        names += ["testMode"]
        #if targetEnvironment(simulator)
        names += ["probeBackupFile"]
        #endif
        #endif
        return names.map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    }()
    private let queue = DispatchQueue(label: "com.whoseday.feasibility.vault")
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private enum VaultError: Error { case invalid, storage }
    private var documentCall: CAPPluginCall?
    private weak var activeDocumentPicker: UIDocumentPickerViewController?
    private var readingDocument = false
    private var exporting = false
    private var backupURL: URL?
    private var photoCall: CAPPluginCall?
    private weak var activePhotoPicker: PHPickerViewController?
    private var loadingPhoto = false
    private var photoRequestID = UUID()

    @objc func pickImage(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.photoCall == nil, self.documentCall == nil, let host = self.bridge?.viewController, host.presentedViewController == nil else { call.reject("Close the current picker first."); return }
            // No PHPhotoLibrary instance or authorization request: the system
            // returns only the item the person explicitly chooses.
            var configuration = PHPickerConfiguration()
            configuration.filter = .images; configuration.selectionLimit = 1
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self; picker.modalPresentationStyle = .pageSheet
            self.photoRequestID = UUID(); self.photoCall = call; self.activePhotoPicker = picker
            picker.presentationController?.delegate = self
            host.present(picker, animated: true) { picker.presentationController?.delegate = self }
        }
    }
    private func finishPhoto(_ result: JSObject? = nil, error: String? = nil, requestID: UUID) {
        // Interactive dismissal and PHPicker completion can both arrive. A late
        // completion must never settle a newly opened picker request.
        guard requestID == photoRequestID, photoCall != nil else { return }
        photoRequestID = UUID()
        let call = photoCall; photoCall = nil; activePhotoPicker = nil; loadingPhoto = false
        if let error { call?.reject(error) } else { call?.resolve(result ?? ["cancelled": true]) }
    }
    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        guard picker === activePhotoPicker, photoCall != nil else { return }
        let requestID = photoRequestID
        guard results.count == 1, let provider = results.first?.itemProvider else {
            picker.dismiss(animated: true) { self.finishPhoto(requestID: requestID) }; return
        }
        loadingPhoto = true; picker.dismiss(animated: true)
        provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, _ in
            // The provider's temporary URL is valid only inside this callback.
            // Downsample during decode so a full camera image is not expanded
            // into a large bitmap before the app applies its 1600px boundary.
            guard let url, let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 30 * 1024 * 1024,
                  let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 1600, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceShouldCacheImmediately: true] as CFDictionary),
                  let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.75), !data.isEmpty, data.count <= 3 * 1024 * 1024 else {
                DispatchQueue.main.async { self.finishPhoto(error: "Could not read this image within the attachment limits.", requestID: requestID) }; return
            }
            let result: JSObject = ["cancelled": false, "name": "check-in-image.jpg", "type": "image/jpeg", "dataUrl": "data:image/jpeg;base64," + data.base64EncodedString()]
            DispatchQueue.main.async { self.finishPhoto(result, requestID: requestID) }
        }
    }

    #if DEBUG
    @objc func testMode(_ call: CAPPluginCall) {
        #if targetEnvironment(simulator)
        let args = ProcessInfo.processInfo.arguments
        let mode = args.contains("--lab-onboarding-write") ? "onboarding-write" : args.contains("--lab-onboarding-read") ? "onboarding-read" : args.contains("--lab-photo-write") ? "photo-write" : args.contains("--lab-photo-read") ? "photo-read" : args.contains("--lab-reports-write") ? "reports-write" : args.contains("--lab-reports-read") ? "reports-read" : args.contains("--lab-backup-write") ? "backup-write" : args.contains("--lab-backup-read") ? "backup-read" : args.contains("--lab-account-write") ? "account-write" : args.contains("--lab-account-read") ? "account-read" : args.contains("--lab-checkin-write") ? "checkin-write" : args.contains("--lab-checkin-read") ? "checkin-read" : args.contains("--lab-probe-write") ? "write" : args.contains("--lab-probe-read") ? "read" : args.contains("--lab-auth") ? "auth" : ""
        call.resolve(["mode": mode])
        #else
        call.resolve(["mode": ""])
        #endif
    }
    #endif
    private func key(_ call: CAPPluginCall) throws -> String {
        guard let key = call.getString("key"), !key.isEmpty, key.count <= 200,
              key.range(of: "^[A-Za-z0-9:._-]+$", options: .regularExpression) != nil else { throw VaultError.invalid }
        return key
    }
    private func database<T>(_ block: (OpaquePointer) throws -> T) throws -> T {
        let fm = FileManager.default
        var directory = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("WhoseDayLab")
        try fm.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        var values = URLResourceValues(); values.isExcludedFromBackup = true; try directory.setResourceValues(values)
        var handle: OpaquePointer?
        guard sqlite3_open(directory.appendingPathComponent("records.sqlite").path, &handle) == SQLITE_OK, let db = handle else { if let handle { sqlite3_close(handle) }; throw VaultError.storage }
        defer { sqlite3_close(db) }
        sqlite3_busy_timeout(db, 5000)
        guard sqlite3_exec(db, "PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);", nil, nil, nil) == SQLITE_OK else { throw VaultError.storage }
        return try block(db)
    }
    @objc func write(_ call: CAPPluginCall) {
        queue.async { do {
            let key = try self.key(call)
            guard let value = call.getString("value"), value.utf8.count <= 6 * 1024 * 1024 else { throw VaultError.invalid }
            try self.database { db in
                var statement: OpaquePointer?
                guard sqlite3_prepare_v2(db, "INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", -1, &statement, nil) == SQLITE_OK else { throw VaultError.storage }
                defer { sqlite3_finalize(statement) }
                guard sqlite3_bind_text(statement, 1, key, -1, self.transient) == SQLITE_OK,
                      sqlite3_bind_text(statement, 2, value, -1, self.transient) == SQLITE_OK,
                      sqlite3_step(statement) == SQLITE_DONE else { throw VaultError.storage }
            }
            call.resolve()
        } catch { call.reject("Native record write failed.") } }
    }
    @objc func read(_ call: CAPPluginCall) {
        queue.async { do {
            let key = try self.key(call)
            let value: String? = try self.database { db in
                var statement: OpaquePointer?
                guard sqlite3_prepare_v2(db, "SELECT value FROM records WHERE key=?", -1, &statement, nil) == SQLITE_OK else { throw VaultError.storage }
                defer { sqlite3_finalize(statement) }
                guard sqlite3_bind_text(statement, 1, key, -1, self.transient) == SQLITE_OK else { throw VaultError.storage }
                let result = sqlite3_step(statement)
                if result == SQLITE_DONE { return nil }
                guard result == SQLITE_ROW, let text = sqlite3_column_text(statement, 0) else { throw VaultError.storage }
                return String(cString: text)
            }
            call.resolve(["value": value.map { $0 as Any } ?? NSNull()])
        } catch { call.reject("Native record read failed.") } }
    }
    @objc func compareBatch(_ call: CAPPluginCall) {
        queue.async { do {
            guard let rows = call.getArray("rows", JSObject.self), !rows.isEmpty, rows.count <= 20002 else { throw VaultError.invalid }
            var seen = Set<String>(), total = 0
            for row in rows {
                guard let key = row["key"] as? String, key.range(of: "^[A-Za-z0-9:._-]{1,200}$", options: .regularExpression) != nil,
                      seen.insert(key).inserted, row["expected"] is String || row["expected"] is NSNull else { throw VaultError.invalid }
                if let value = row["value"] { guard let text = value as? String, text.utf8.count <= 6 * 1024 * 1024 else { throw VaultError.invalid }; total += text.utf8.count }
                total += (row["expected"] as? String)?.utf8.count ?? 0
            }
            guard total <= 64 * 1024 * 1024 else { throw VaultError.invalid }
            let rollbackProbe = call.getBool("probeRollback") == true
            if rollbackProbe {
                #if DEBUG && targetEnvironment(simulator)
                guard ProcessInfo.processInfo.arguments.contains("--lab-backup-write") else { throw VaultError.invalid }
                #else
                throw VaultError.invalid
                #endif
            }
            let matched = try self.database { db -> Bool in
                guard sqlite3_exec(db, "BEGIN IMMEDIATE", nil, nil, nil) == SQLITE_OK else { throw VaultError.storage }
                var committed = false
                defer { if !committed { sqlite3_exec(db, "ROLLBACK", nil, nil, nil) } }
                for row in rows {
                    var statement: OpaquePointer?
                    guard sqlite3_prepare_v2(db, "SELECT value FROM records WHERE key=?", -1, &statement, nil) == SQLITE_OK else { throw VaultError.storage }
                    defer { sqlite3_finalize(statement) }
                    guard sqlite3_bind_text(statement, 1, row["key"] as! String, -1, self.transient) == SQLITE_OK else { throw VaultError.storage }
                    let step = sqlite3_step(statement)
                    let actual: String?
                    if step == SQLITE_DONE { actual = nil }
                    else if step == SQLITE_ROW, let text = sqlite3_column_text(statement, 0) { actual = String(cString: text) }
                    else { throw VaultError.storage }
                    if actual != row["expected"] as? String { return false }
                }
                for row in rows {
                    guard let value = row["value"] as? String else { continue }
                    var statement: OpaquePointer?
                    guard sqlite3_prepare_v2(db, "INSERT INTO records(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", -1, &statement, nil) == SQLITE_OK else { throw VaultError.storage }
                    defer { sqlite3_finalize(statement) }
                    guard sqlite3_bind_text(statement, 1, row["key"] as! String, -1, self.transient) == SQLITE_OK,
                          sqlite3_bind_text(statement, 2, value, -1, self.transient) == SQLITE_OK,
                          sqlite3_step(statement) == SQLITE_DONE else { throw VaultError.storage }
                    if rollbackProbe { throw VaultError.storage }
                }
                guard sqlite3_exec(db, "COMMIT", nil, nil, nil) == SQLITE_OK else { throw VaultError.storage }
                committed = true; return true
            }
            call.resolve(["matched": matched])
        } catch { call.reject("Native restore transaction failed. Reopen to check saved records.") } }
    }
    private func backupFile(_ text: String, name: String) throws -> URL {
        guard text.utf8.count <= 25 * 1024 * 1024, name.range(of: "^whose-day-backup-[0-9-]+\\.json$", options: .regularExpression) != nil else { throw VaultError.invalid }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("whose-day-backups")
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        let url = directory.appendingPathComponent(name)
        try Data(text.utf8).write(to: url, options: [.atomic, .completeFileProtection]); return url
    }
    private func readBackup(_ url: URL) throws -> String {
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?, result: Result<String, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { target in
            result = Result { () throws -> String in
                let file = try FileHandle(forReadingFrom: target); defer { try? file.close() }
                var data = Data()
                while let chunk = try file.read(upToCount: 65536), !chunk.isEmpty {
                    guard data.count + chunk.count <= 25 * 1024 * 1024 else { throw VaultError.invalid }; data.append(chunk)
                }
                guard let text = String(data: data, encoding: .utf8) else { throw VaultError.invalid }; return text
            }
        }
        if let error = coordinationError { throw error }
        guard let result else { throw VaultError.storage }; return try result.get()
    }
    private func finishDocument(_ result: JSObject? = nil, error: String? = nil) {
        let call = documentCall; documentCall = nil; activeDocumentPicker = nil; readingDocument = false
        if let url = backupURL { try? FileManager.default.removeItem(at: url) }; backupURL = nil
        if let error { call?.reject(error) } else { call?.resolve(result ?? ["cancelled": true]) }
    }
    @objc func exportBackup(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.documentCall == nil, let host = self.bridge?.viewController, host.presentedViewController == nil else { call.reject("Close the current file picker first."); return }
            do {
                guard let text = call.getString("text"), let name = call.getString("name") else { throw VaultError.invalid }
                let url = try self.backupFile(text, name: name); self.backupURL = url; self.documentCall = call; self.exporting = true
                let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true); picker.delegate = self
                self.activeDocumentPicker = picker
                host.present(picker, animated: true); picker.presentationController?.delegate = self
            } catch { self.documentCall = call; self.finishDocument(error: "Could not prepare the backup file.") }
        }
    }
    @objc func importBackup(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.documentCall == nil, let host = self.bridge?.viewController, host.presentedViewController == nil else { call.reject("Close the current file picker first."); return }
            self.documentCall = call; self.exporting = false
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true); picker.allowsMultipleSelection = false; picker.delegate = self
            self.activeDocumentPicker = picker
            host.present(picker, animated: true); picker.presentationController?.delegate = self
        }
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { if controller === activeDocumentPicker { finishDocument() } }
    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        if presentationController.presentedViewController === activePhotoPicker && !loadingPhoto { finishPhoto(requestID: photoRequestID) }
        if presentationController.presentedViewController === activeDocumentPicker && !readingDocument { finishDocument() }
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard controller === activeDocumentPicker, documentCall != nil else { return }
        if exporting { finishDocument(["saved": true]); return }
        guard urls.count == 1, let url = urls.first else { finishDocument(error: "Choose one JSON backup."); return }
        readingDocument = true
        queue.async {
            // asCopy imports into the app container. Remove only that temporary
            // copy on success or failure; never remove the provider original.
            defer {
                let path = url.standardizedFileURL.path
                if path.hasPrefix(NSHomeDirectory() + "/tmp/") || path.hasPrefix(NSHomeDirectory() + "/Documents/Inbox/") { try? FileManager.default.removeItem(at: url) }
            }
            do {
                let text = try self.readBackup(url)
                DispatchQueue.main.async { self.finishDocument(["text": text, "name": url.lastPathComponent]) }
            } catch { DispatchQueue.main.async { self.finishDocument(error: "Could not read this backup. Choose a UTF-8 JSON file up to 25 MB.") } }
        }
    }
    #if DEBUG && targetEnvironment(simulator)
    @objc func probeBackupFile(_ call: CAPPluginCall) {
        guard ProcessInfo.processInfo.arguments.contains("--lab-backup-write"), let text = call.getString("text") else { call.reject("Probe unavailable."); return }
        queue.async { do {
            let url = try self.backupFile(text, name: "whose-day-backup-2000-01-01.json"); defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
            call.resolve(["text": try self.readBackup(url)])
        } catch { call.reject("Backup file probe failed.") } }
    }
    #endif
    private func secretQuery(_ call: CAPPluginCall) throws -> [String: Any] {
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.whoseday.feasibility.auth", kSecAttrAccount as String: try key(call)]
    }
    @objc func keys(_ call: CAPPluginCall) {
        queue.async { do {
            guard let prefix = call.getString("prefix"), !prefix.isEmpty, prefix.count <= 160,
                  prefix.range(of: "^[A-Za-z0-9:._-]+$", options: .regularExpression) != nil else { throw VaultError.invalid }
            let keys: [String] = try self.database { db in
                var statement: OpaquePointer?
                guard sqlite3_prepare_v2(db, "SELECT key FROM records WHERE substr(key,1,?)=? ORDER BY key LIMIT 20001", -1, &statement, nil) == SQLITE_OK else { throw VaultError.storage }
                defer { sqlite3_finalize(statement) }
                guard sqlite3_bind_int(statement, 1, Int32(prefix.utf8.count)) == SQLITE_OK,
                      sqlite3_bind_text(statement, 2, prefix, -1, self.transient) == SQLITE_OK else { throw VaultError.storage }
                var result: [String] = []
                while true {
                    let step = sqlite3_step(statement)
                    if step == SQLITE_DONE { break }
                    guard step == SQLITE_ROW, let value = sqlite3_column_text(statement, 0) else { throw VaultError.storage }
                    result.append(String(cString: value))
                }
                return result
            }
            call.resolve(["keys": keys])
        } catch { call.reject("Native record listing failed.") } }
    }
    @objc func writeSecret(_ call: CAPPluginCall) {
        queue.async { do {
            var query = try self.secretQuery(call)
            guard let value = call.getString("value"), let data = value.data(using: .utf8), data.count <= 65536 else { throw VaultError.invalid }
            let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
            var result = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
            if result == errSecItemNotFound { query.merge(attributes) { _, new in new }; result = SecItemAdd(query as CFDictionary, nil) }
            guard result == errSecSuccess else { call.reject("Secure session write failed (status \(result))."); return }; call.resolve()
        } catch { call.reject("Secure session write failed.") } }
    }
    @objc func readSecret(_ call: CAPPluginCall) {
        queue.async { do {
            var query = try self.secretQuery(call); query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
            var item: CFTypeRef?; let result = SecItemCopyMatching(query as CFDictionary, &item)
            if result == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
            guard result == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) else { throw VaultError.storage }
            call.resolve(["value": value])
        } catch { call.reject("Secure session read failed.") } }
    }
    @objc func removeSecret(_ call: CAPPluginCall) {
        queue.async { do {
            let result = SecItemDelete(try self.secretQuery(call) as CFDictionary)
            guard result == errSecSuccess || result == errSecItemNotFound else { throw VaultError.storage }; call.resolve()
        } catch { call.reject("Secure session removal failed.") } }
    }
    private func exportLocation(_ call: CAPPluginCall, extension ext: String) throws -> URL {
        let scope = call.getString("scope") ?? "lab"
        let name = call.getString("name") ?? "whose-day-report-" + UUID().uuidString + "." + ext
        guard scope.range(of: "^[A-Za-z0-9_-]{1,80}$", options: .regularExpression) != nil,
              name.range(of: "^whose-day-(report|records)-[A-Za-z0-9-]+\\." + ext + "$", options: .regularExpression) != nil else { throw VaultError.invalid }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("lab-reports").appendingPathComponent(scope + "-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        return directory.appendingPathComponent(name)
    }
    private func exportFile(_ call: CAPPluginCall) throws -> URL {
        guard let raw = call.getString("uri"), let url = URL(string: raw), url.isFileURL, url.host == nil || url.host == "", url.query == nil, url.fragment == nil else { throw VaultError.invalid }
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("lab-reports").resolvingSymlinksInPath().path + "/"
        let target = url.standardizedFileURL.resolvingSymlinksInPath()
        guard target.path.hasPrefix(base), ["pdf", "csv"].contains(target.pathExtension) else { throw VaultError.invalid }
        let file = try FileHandle(forReadingFrom: target); defer { try? file.close() }
        guard try file.seekToEnd() <= 25 * 1024 * 1024 else { throw VaultError.invalid }; return target
    }
    @objc func saveExport(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.documentCall == nil, let host = self.bridge?.viewController, host.presentedViewController == nil else { call.reject("Close the current file picker first."); return }
            do {
                let url = try self.exportFile(call); self.documentCall = call; self.exporting = true; self.backupURL = url
                let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true); picker.delegate = self; self.activeDocumentPicker = picker
                host.present(picker, animated: true); picker.presentationController?.delegate = self
            } catch { call.reject("Could not open this prepared export. Generate it again.") }
        }
    }
    @objc func copyText(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.isEmpty, text.utf8.count <= 1024 * 1024 else { call.reject("Choose a shorter report before copying."); return }
        DispatchQueue.main.async { UIPasteboard.general.string = text; call.resolve() }
    }
    @objc func makeTextFile(_ call: CAPPluginCall) {
        queue.async { do {
            guard let text = call.getString("text"), !text.isEmpty, text.utf8.count <= 25 * 1024 * 1024 else { throw VaultError.invalid }
            let url = try self.exportLocation(call, extension: "csv"), data = Data(text.utf8)
            try data.write(to: url, options: [.atomic, .completeFileProtection])
            guard try Data(contentsOf: url) == data else { throw VaultError.storage }; call.resolve(["uri": url.absoluteString])
        } catch { call.reject("Could not prepare this CSV file. Your records are kept.") } }
    }
    @objc func makeReport(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.isEmpty, text.utf8.count <= 1024 * 1024 else { call.reject("Choose a shorter report period (up to 1 MB of text)."); return }
        queue.async { do {
            let url = try self.exportLocation(call, extension: "pdf")
            let attributed = NSAttributedString(string: text, attributes: [.font: UIFont.monospacedSystemFont(ofSize: 11, weight: .regular)])
            let attestation = call.getString("attestation")
            if let attestation { guard text.hasSuffix(attestation) else { throw VaultError.invalid } }
            let attestationStart = attestation.map { attributed.length - ($0 as NSString).length } ?? attributed.length
            let setter = CTFramesetterCreateWithAttributedString(attributed)
            let format = UIGraphicsPDFRendererFormat(); format.documentInfo = [kCGPDFContextCreator as String: "Whose Day", kCGPDFContextTitle as String: url.lastPathComponent]
            let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 595, height: 842), format: format)
            var failed = false
            let data = renderer.pdfData { context in
                var offset = 0, page = 0
                while offset < attributed.length {
                    let path = CGPath(rect: CGRect(x: 40, y: 52, width: 515, height: 750), transform: nil)
                    let sectionEnd = offset < attestationStart ? attestationStart : attributed.length
                    let frame = CTFramesetterCreateFrame(setter, CFRange(location: offset, length: sectionEnd - offset), path, nil)
                    let length = CTFrameGetVisibleStringRange(frame).length
                    if length == 0 { failed = true; break }
                    if (text as NSString).substring(with: NSRange(location: offset, length: length)).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { offset += length; continue }
                    page += 1; if page > 1000 { failed = true; break }; context.beginPage()
                    let graphics = context.cgContext; graphics.saveGState(); graphics.textMatrix = .identity; graphics.translateBy(x: 0, y: 842); graphics.scaleBy(x: 1, y: -1)
                    CTFrameDraw(frame, graphics); graphics.restoreGState()
                    ("Whose Day - Page " + String(page)).draw(in: CGRect(x: 40, y: 810, width: 515, height: 14), withAttributes: [.font: UIFont.systemFont(ofSize: 9), .foregroundColor: UIColor.darkGray])
                    offset += length
                }
            }
            guard !failed, data.count <= 25 * 1024 * 1024 else { throw VaultError.storage }
            try data.write(to: url, options: [.atomic, .completeFileProtection])
            guard try Data(contentsOf: url) == data else { throw VaultError.storage }; call.resolve(["uri": url.absoluteString])
        } catch { call.reject("Could not prepare the complete PDF. Choose a shorter period and try again.") } }
    }
}

@objc(LabViewController)
class LabViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(WhoseDayVaultPlugin()) }
}
