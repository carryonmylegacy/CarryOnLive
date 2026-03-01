import UIKit
import Capacitor

class CarryOnViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Disable rubber-band bounce on the web view's scroll view
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        webView?.scrollView.alwaysBounceHorizontal = false
        
        // Ensure the web view extends behind the status bar
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }
}
