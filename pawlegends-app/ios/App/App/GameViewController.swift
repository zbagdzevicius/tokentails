import UIKit
import WebKit
import Capacitor

/// The Pawlegends game screen (docs/plans/moba/APP-STORE.md "Native shell"): the Capacitor bridge view controller
/// in landscape only, full screen, with no status bar, an auto-hidden home indicator and system edge gestures
/// deferred so a swipe from a screen edge mid-match does not leave the game.
class GameViewController: CAPBridgeViewController {
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override func viewDidLoad() {
        super.viewDidLoad()
        let background = UIColor(red: 0x2b / 255.0, green: 0x1d / 255.0, blue: 0x2e / 255.0, alpha: 1)
        view.backgroundColor = background
        if let webView = webView {
            webView.isOpaque = false
            webView.backgroundColor = background
            webView.scrollView.backgroundColor = background
            webView.scrollView.bounces = false
            webView.scrollView.contentInsetAdjustmentBehavior = .never
            webView.scrollView.isScrollEnabled = false
            webView.allowsBackForwardNavigationGestures = false
        }
        setNeedsUpdateOfHomeIndicatorAutoHidden()
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
    }

    /// Audio plays inline and WebGL keeps running: the game's own settings, set before the WebView is created.
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.suppressesIncrementalRendering = false
        return config
    }

    /// The OTA channel (src/shell/manifest.ts), set before any page script so every bundle (built in or updated)
    /// reads the channel of the binary it runs in. Added here, not in webViewConfiguration: Capacitor swaps in its
    /// own userContentController between the two calls.
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let channel = WKUserScript(source: "window.__PL_CHANNEL__ = '\(GameViewController.otaChannel)';", injectionTime: .atDocumentStart, forMainFrameOnly: true)
        configuration.userContentController.addUserScript(channel)
        return super.webView(with: frame, configuration: configuration)
    }

    /// `dev` for Debug builds (a local update server, scripts/ota-local.mjs), `beta` for TestFlight installs (their
    /// receipt is a sandbox receipt), `stable` for App Store installs. Beta gets each update a day before stable.
    static var otaChannel: String {
        #if DEBUG
        return "dev"
        #else
        return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt" ? "beta" : "stable"
        #endif
    }
}
