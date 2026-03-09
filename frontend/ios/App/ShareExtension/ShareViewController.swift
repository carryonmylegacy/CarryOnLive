import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

/// CarryOn Share Extension — receives files shared from other apps and saves them
/// to the App Group container for pickup by the main CarryOn app.
class ShareViewController: UIViewController {

    private let appGroupId = "group.us.carryon.app"
    private let sharedKey = "CarryOnSharedFiles"

    override func viewDidLoad() {
        super.viewDidLoad()
        handleIncomingContent()
    }

    private func handleIncomingContent() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            completeRequest()
            return
        }

        let group = DispatchGroup()

        for item in extensionItems {
            guard let attachments = item.attachments else { continue }
            for provider in attachments {
                group.enter()
                handleAttachment(provider) { group.leave() }
            }
        }

        group.notify(queue: .main) { [weak self] in
            self?.completeRequest()
        }
    }

    private func handleAttachment(_ provider: NSItemProvider, completion: @escaping () -> Void) {
        // Accept PDFs, images (JPEG, PNG, HEIC)
        let supportedTypes: [UTType] = [.pdf, .jpeg, .png, .heic, .heif, .image]

        for utType in supportedTypes {
            if provider.hasItemConformingToTypeIdentifier(utType.identifier) {
                provider.loadFileRepresentation(forTypeIdentifier: utType.identifier) { [weak self] url, error in
                    guard let self = self, let url = url, error == nil else {
                        completion()
                        return
                    }
                    self.saveToAppGroup(url: url, utType: utType)
                    completion()
                }
                return
            }
        }
        completion()
    }

    private func saveToAppGroup(url: URL, utType: UTType) {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) else { return }

        let sharedDir = containerURL.appendingPathComponent("shared", isDirectory: true)
        try? FileManager.default.createDirectory(at: sharedDir, withIntermediateDirectories: true)

        let fileName = url.lastPathComponent
        let destURL = sharedDir.appendingPathComponent(fileName)

        // Remove existing file with same name
        try? FileManager.default.removeItem(at: destURL)
        try? FileManager.default.copyItem(at: url, to: destURL)

        // Store metadata in UserDefaults for the main app to read
        let defaults = UserDefaults(suiteName: appGroupId)
        var files = defaults?.array(forKey: sharedKey) as? [[String: String]] ?? []
        files.append([
            "name": fileName,
            "path": destURL.path,
            "type": utType.preferredMIMEType ?? "application/octet-stream",
            "timestamp": ISO8601DateFormatter().string(from: Date()),
        ])
        defaults?.set(files, forKey: sharedKey)
    }

    private func completeRequest() {
        // Open the main app via URL scheme so it can pick up the shared files
        if let url = URL(string: "carryon://share") {
            var responder: UIResponder? = self
            while responder != nil {
                if let application = responder as? UIApplication {
                    application.open(url, options: [:], completionHandler: nil)
                    break
                }
                responder = responder?.next
            }
        }
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
