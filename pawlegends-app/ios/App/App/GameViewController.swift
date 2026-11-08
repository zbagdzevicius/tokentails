import UIKit
import WebKit
import Capacitor

/// The Pawlegends game screen (docs/plans/moba/APP-STORE.md "Native shell"): the Capacitor bridge view controller
/// in landscape only, full screen, with no status bar, an auto-hidden home indicator and system edge gestures
/// deferred so a swipe from a screen edge mid-match does not leave the game.
///
/// The same controller runs the Mac app (Mac Catalyst, "Optimize for Mac"): there the status bar, home indicator and
/// orientation overrides do nothing, the page is told it runs on a Mac (`window.__PL_PLATFORM__`) and the WebView
/// asks for desktop content, so the game uses its keyboard and mouse controls and desktop HUD.
class GameViewController: CAPBridgeViewController {
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    /// `mac` in the Mac app, `ios` on iPhone (src/shell/main.ts and pawlegends/src/app/platform.ts read it).
    static var platform: String {
        #if targetEnvironment(macCatalyst)
        return "mac"
        #else
        return "ios"
        #endif
    }

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
        // PERF-IOS P2-7: the game's thermal governor steps the graphics down before iOS throttles the chip
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(thermalChanged), name: ProcessInfo.thermalStateDidChangeNotification, object: nil)
        center.addObserver(self, selector: #selector(thermalChanged), name: Notification.Name.NSProcessInfoPowerStateDidChange, object: nil)
    }

    /// `window.__PL_THERMAL__` as a JS literal: the thermal state (nominal / fair / serious / critical) and Low Power Mode.
    static var thermalLiteral: String {
        let state: String
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: state = "nominal"
        case .fair: state = "fair"
        case .serious: state = "serious"
        case .critical: state = "critical"
        @unknown default: state = "fair"
        }
        let lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled ? "true" : "false"
        return "{ state: '\(state)', lowPower: \(lowPower) }"
    }

    /// Thermal or power state changed: tell the page (pawlegends/src/render/perf/thermal.ts listens for `pl-thermal`).
    @objc private func thermalChanged() {
        DispatchQueue.main.async { [weak self] in
            let js = "window.__PL_THERMAL__ = \(GameViewController.thermalLiteral); window.dispatchEvent(new Event('pl-thermal'));"
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        #if targetEnvironment(macCatalyst)
        // keys reach the game without a first click into the window
        webView?.becomeFirstResponder()
        #endif
        #if DEBUG
        DebugProbe.scheduleIfAsked(self)
        #endif
    }

    /// Audio plays inline and WebGL keeps running: the game's own settings, set before the WebView is created.
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.suppressesIncrementalRendering = false
        #if targetEnvironment(macCatalyst)
        // capacitor.config.ts asks for mobile content for the iPhone; the Mac gets the desktop page
        config.defaultWebpagePreferences.preferredContentMode = .desktop
        #endif
        return config
    }

    /// The OTA channel (src/shell/manifest.ts) and the platform, set before any page script so every bundle (built in
    /// or updated) reads the values of the binary it runs in. Added here, not in webViewConfiguration: Capacitor swaps
    /// in its own userContentController between the two calls.
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let source = "window.__PL_CHANNEL__ = '\(GameViewController.otaChannel)'; window.__PL_PLATFORM__ = '\(GameViewController.platform)'; window.__PL_THERMAL__ = \(GameViewController.thermalLiteral);"
        let script = WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        configuration.userContentController.addUserScript(script)
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

#if DEBUG
/// Debug builds only, to check a local build without Screen Recording permission (scripts/build-mac.mjs --run): with
/// `PL_PROBE=<dir>` in the environment, after `PL_PROBE_DELAY` seconds (default 15) the app writes `<dir>/probe.png`
/// (a WebView snapshot) and `<dir>/probe.json` (what the page sees), then quits (unless `PL_PROBE_STAY` is set).
enum DebugProbe {
    static func scheduleIfAsked(_ vc: GameViewController) {
        let env = ProcessInfo.processInfo.environment
        guard let dir = env["PL_PROBE"], !dir.isEmpty else { return }
        let delay = Double(env["PL_PROBE_DELAY"] ?? "") ?? 15
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { run(vc, dir: URL(fileURLWithPath: dir)) }
    }

    private static func run(_ vc: GameViewController, dir: URL) {
        guard let webView = vc.webView else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let js = """
        JSON.stringify({ platform: window.__PL_PLATFORM__, channel: window.__PL_CHANNEL__, coarse: matchMedia('(pointer: coarse)').matches,
          fine: matchMedia('(pointer: fine)').matches, hover: matchMedia('(hover: hover)').matches, touch: document.documentElement.dataset.touch || '',
          ready: document.documentElement.dataset.ready || '', screen: document.documentElement.dataset.screen || '', shell: document.documentElement.dataset.shell || '',
          ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, size: [innerWidth, innerHeight], dpr: devicePixelRatio,
          vibrate: typeof navigator.vibrate, window: [\(Int(webView.window?.bounds.width ?? 0)), \(Int(webView.window?.bounds.height ?? 0))] })
        """
        webView.evaluateJavaScript(js) { result, error in
            let text = (result as? String) ?? "{\"error\": \"\(String(describing: error))\"}"
            try? text.write(to: dir.appendingPathComponent("probe.json"), atomically: true, encoding: .utf8)
            webView.takeSnapshot(with: nil) { image, _ in
                if let data = image?.pngData() { try? data.write(to: dir.appendingPathComponent("probe.png")) }
                if ProcessInfo.processInfo.environment["PL_PROBE_STAY"] == nil { exit(0) }
            }
        }
    }
}
#endif
