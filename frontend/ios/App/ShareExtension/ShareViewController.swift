import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

/// CarryOn Share Extension — receives files shared from other apps.
/// Shows a category picker, then saves the file to the App Group container
/// for the main CarryOn app to encrypt and upload to the Secure Document Vault.
class ShareViewController: UIViewController {

    private let appGroupId = "group.us.carryon.app"
    private let sharedKey = "CarryOnSharedFiles"

    // Category picker UI
    private let categories: [(id: String, label: String, icon: String)] = [
        ("will", "Will", "doc.text"),
        ("trust", "Trust", "building.columns"),
        ("living_will", "Living Will", "heart.text.square"),
        ("life_insurance", "Life Insurance", "shield.checkered"),
        ("deed", "Deed / Title", "house"),
        ("poa", "Power of Attorney", "person.badge.key"),
        ("financial", "Financial", "dollarsign.circle"),
        ("medical", "Medical", "cross.case"),
        ("legal", "Legal (Other)", "book.closed"),
        ("personal", "Personal", "folder"),
    ]

    private var selectedCategory: String?
    private var pendingURL: URL?
    private var pendingUTType: UTType?
    private var fileName: String = "Shared Document"

    // UI Elements
    private let containerView = UIView()
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let fileInfoLabel = UILabel()
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private let uploadButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        handleIncomingContent()
    }

    // MARK: - UI Setup

    private func setupUI() {
        view.backgroundColor = UIColor(red: 0.04, green: 0.07, blue: 0.13, alpha: 0.95)

        // Container
        containerView.backgroundColor = UIColor(red: 0.06, green: 0.10, blue: 0.18, alpha: 1.0)
        containerView.layer.cornerRadius = 20
        containerView.layer.borderWidth = 1
        containerView.layer.borderColor = UIColor(red: 0.83, green: 0.69, blue: 0.22, alpha: 0.2).cgColor
        containerView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(containerView)

        // Title
        titleLabel.text = "Save to CarryOn Vault"
        titleLabel.font = UIFont.systemFont(ofSize: 20, weight: .bold)
        titleLabel.textColor = UIColor(red: 0.88, green: 0.73, blue: 0.22, alpha: 1.0)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(titleLabel)

        // Subtitle
        subtitleLabel.text = "Choose a document category"
        subtitleLabel.font = UIFont.systemFont(ofSize: 13, weight: .medium)
        subtitleLabel.textColor = UIColor(white: 0.55, alpha: 1.0)
        subtitleLabel.textAlignment = .center
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(subtitleLabel)

        // File info
        fileInfoLabel.font = UIFont.systemFont(ofSize: 12, weight: .semibold)
        fileInfoLabel.textColor = UIColor(white: 0.7, alpha: 1.0)
        fileInfoLabel.textAlignment = .center
        fileInfoLabel.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(fileInfoLabel)

        // Table view for categories
        tableView.backgroundColor = .clear
        tableView.delegate = self
        tableView.dataSource = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "CategoryCell")
        tableView.separatorColor = UIColor(white: 1.0, alpha: 0.06)
        tableView.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(tableView)

        // Upload button
        uploadButton.setTitle("Save to Vault", for: .normal)
        uploadButton.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .bold)
        uploadButton.setTitleColor(UIColor(red: 0.03, green: 0.05, blue: 0.10, alpha: 1.0), for: .normal)
        uploadButton.backgroundColor = UIColor(red: 0.83, green: 0.69, blue: 0.22, alpha: 1.0)
        uploadButton.layer.cornerRadius = 12
        uploadButton.isEnabled = false
        uploadButton.alpha = 0.5
        uploadButton.addTarget(self, action: #selector(uploadTapped), for: .touchUpInside)
        uploadButton.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(uploadButton)

        // Cancel button
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.titleLabel?.font = UIFont.systemFont(ofSize: 14, weight: .semibold)
        cancelButton.setTitleColor(UIColor(white: 0.5, alpha: 1.0), for: .normal)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(cancelButton)

        // Layout
        NSLayoutConstraint.activate([
            containerView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            containerView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            containerView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            containerView.heightAnchor.constraint(lessThanOrEqualTo: view.heightAnchor, multiplier: 0.75),

            titleLabel.topAnchor.constraint(equalTo: containerView.topAnchor, constant: 20),
            titleLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -16),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 4),
            subtitleLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            subtitleLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -16),

            fileInfoLabel.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 8),
            fileInfoLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            fileInfoLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -16),

            tableView.topAnchor.constraint(equalTo: fileInfoLabel.bottomAnchor, constant: 12),
            tableView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor),
            tableView.heightAnchor.constraint(equalToConstant: 300),

            uploadButton.topAnchor.constraint(equalTo: tableView.bottomAnchor, constant: 12),
            uploadButton.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            uploadButton.trailingAnchor.constraint(equalTo: containerView.trailingAnchor, constant: -16),
            uploadButton.heightAnchor.constraint(equalToConstant: 48),

            cancelButton.topAnchor.constraint(equalTo: uploadButton.bottomAnchor, constant: 8),
            cancelButton.centerXAnchor.constraint(equalTo: containerView.centerXAnchor),
            cancelButton.bottomAnchor.constraint(equalTo: containerView.bottomAnchor, constant: -16),
        ])
    }

    // MARK: - Content Handling

    private func handleIncomingContent() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            completeRequest()
            return
        }

        for item in extensionItems {
            guard let attachments = item.attachments else { continue }
            for provider in attachments {
                handleAttachment(provider)
                return // Handle first file only
            }
        }
    }

    private func handleAttachment(_ provider: NSItemProvider) {
        let supportedTypes: [UTType] = [.pdf, .jpeg, .png, .heic, .heif, .image,
            .init("com.microsoft.word.doc")!, .init("org.openxmlformats.wordprocessingml.document")!,
            .init("com.microsoft.excel.xls")!, .init("org.openxmlformats.spreadsheetml.sheet")!]

        for utType in supportedTypes {
            if provider.hasItemConformingToTypeIdentifier(utType.identifier) {
                provider.loadFileRepresentation(forTypeIdentifier: utType.identifier) { [weak self] url, error in
                    guard let self = self, let url = url, error == nil else { return }

                    // Copy to temp location (the provided URL is temporary)
                    let tempDir = FileManager.default.temporaryDirectory
                    let tempURL = tempDir.appendingPathComponent(url.lastPathComponent)
                    try? FileManager.default.removeItem(at: tempURL)
                    try? FileManager.default.copyItem(at: url, to: tempURL)

                    DispatchQueue.main.async {
                        self.pendingURL = tempURL
                        self.pendingUTType = utType
                        self.fileName = url.lastPathComponent

                        let fileSize = (try? FileManager.default.attributesOfItem(atPath: tempURL.path)[.size] as? Int64) ?? 0
                        let sizeStr = ByteCountFormatter.string(fromByteCount: fileSize, countStyle: .file)
                        self.fileInfoLabel.text = "\(self.fileName) · \(sizeStr)"
                    }
                }
                return
            }
        }

        // Unsupported file type
        DispatchQueue.main.async {
            self.fileInfoLabel.text = "Unsupported file type"
            self.fileInfoLabel.textColor = UIColor.systemRed
        }
    }

    // MARK: - Actions

    @objc private func uploadTapped() {
        guard let url = pendingURL, let category = selectedCategory, let utType = pendingUTType else { return }
        saveToAppGroup(url: url, utType: utType, category: category)
        completeRequest()
    }

    @objc private func cancelTapped() {
        completeRequest()
    }

    private func saveToAppGroup(url: URL, utType: UTType, category: String) {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) else { return }

        let sharedDir = containerURL.appendingPathComponent("shared", isDirectory: true)
        try? FileManager.default.createDirectory(at: sharedDir, withIntermediateDirectories: true)

        let destURL = sharedDir.appendingPathComponent(url.lastPathComponent)
        try? FileManager.default.removeItem(at: destURL)
        try? FileManager.default.copyItem(at: url, to: destURL)

        // Store metadata in UserDefaults for the main app to read
        let defaults = UserDefaults(suiteName: appGroupId)
        var files = defaults?.array(forKey: sharedKey) as? [[String: String]] ?? []
        files.append([
            "name": url.lastPathComponent,
            "path": destURL.path,
            "type": utType.preferredMIMEType ?? "application/octet-stream",
            "category": category,
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

// MARK: - Table View

extension ShareViewController: UITableViewDelegate, UITableViewDataSource {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return categories.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "CategoryCell", for: indexPath)
        let cat = categories[indexPath.row]

        cell.textLabel?.text = cat.label
        cell.textLabel?.textColor = .white
        cell.textLabel?.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
        cell.backgroundColor = UIColor(white: 1.0, alpha: 0.03)
        cell.imageView?.image = UIImage(systemName: cat.icon)
        cell.imageView?.tintColor = UIColor(red: 0.83, green: 0.69, blue: 0.22, alpha: 1.0)

        if selectedCategory == cat.id {
            cell.accessoryType = .checkmark
            cell.tintColor = UIColor(red: 0.83, green: 0.69, blue: 0.22, alpha: 1.0)
            cell.backgroundColor = UIColor(red: 0.83, green: 0.69, blue: 0.22, alpha: 0.08)
        } else {
            cell.accessoryType = .none
        }

        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        selectedCategory = categories[indexPath.row].id
        tableView.reloadData()
        uploadButton.isEnabled = true
        uploadButton.alpha = 1.0
    }
}
