import Capacitor
import SQLite3
import Security
import UIKit
import CoreText

@objc(WhoseDayVaultPlugin)
public class WhoseDayVaultPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WhoseDayVaultPlugin"
    public let jsName = "WhoseDayVault"
    public let pluginMethods: [CAPPluginMethod] = ["testMode", "write", "read", "keys", "writeSecret", "readSecret", "removeSecret", "makeReport"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let queue = DispatchQueue(label: "com.whoseday.feasibility.vault")
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private enum VaultError: Error { case invalid, storage }

    @objc func testMode(_ call: CAPPluginCall) {
        #if DEBUG && targetEnvironment(simulator)
        let args = ProcessInfo.processInfo.arguments
        let mode = args.contains("--lab-checkin-write") ? "checkin-write" : args.contains("--lab-checkin-read") ? "checkin-read" : args.contains("--lab-probe-write") ? "write" : args.contains("--lab-probe-read") ? "read" : args.contains("--lab-auth") ? "auth" : ""
        call.resolve(["mode": mode])
        #else
        call.resolve(["mode": ""])
        #endif
    }
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
    @objc func makeReport(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.isEmpty, text.count <= 12000 else { call.reject("Invalid report."); return }
        DispatchQueue.main.async { do {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("lab-reports")
            if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent("Whose-Day-test-" + UUID().uuidString + ".pdf")
            let attributed = NSAttributedString(string: text, attributes: [.font: UIFont.systemFont(ofSize: 13)])
            let setter = CTFramesetterCreateWithAttributedString(attributed)
            let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 595, height: 842))
            let data = renderer.pdfData { context in
                var offset = 0
                while offset < attributed.length {
                    context.beginPage()
                    let graphics = context.cgContext; graphics.saveGState(); graphics.translateBy(x: 0, y: 842); graphics.scaleBy(x: 1, y: -1)
                    let path = CGPath(rect: CGRect(x: 40, y: 40, width: 515, height: 762), transform: nil)
                    let frame = CTFramesetterCreateFrame(setter, CFRange(location: offset, length: 0), path, nil)
                    CTFrameDraw(frame, graphics); graphics.restoreGState()
                    let length = CTFrameGetVisibleStringRange(frame).length
                    if length == 0 { break }; offset += length
                }
            }
            try data.write(to: url, options: [.atomic, .completeFileProtection]); call.resolve(["uri": url.absoluteString])
        } catch { call.reject("Could not create the test PDF.") } }
    }
}

@objc(LabViewController)
class LabViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(WhoseDayVaultPlugin()) }
}
