import UIKit
import AVFoundation
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        // before the game screen loads the Capacitor plugins (the auth plugin needs a FirebaseApp, NativeAuth.swift)
        NativeAuth.setUp()
        // No storyboards: the window and the game screen are made here, the launch screen is the Info.plist
        // UILaunchScreen (background colour and paw from the asset catalog).
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(named: "LaunchBackground")
        window.rootViewController = GameViewController()
        window.makeKeyAndVisible()
        self.window = window
        #if targetEnvironment(macCatalyst)
        configureMacWindow()
        // one game window: closing it quits the app, as Mac players expect from a single-window game
        NotificationCenter.default.addObserver(forName: UIScene.didDisconnectNotification, object: nil, queue: .main) { _ in
            if !UIApplication.shared.connectedScenes.contains(where: { $0 is UIWindowScene }) { exit(0) }
        }
        #endif
        return true
    }

    #if targetEnvironment(macCatalyst)
    /// The Mac window: landscape 16:9, resizable down to 1280×720 (the desktop HUD's smallest comfortable size), no
    /// title text over the game, full screen from the green button or View → Enter Full Screen.
    private func configureMacWindow() {
        guard let scene = window?.windowScene ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else {
            // the scene attaches a moment later on some launches
            DispatchQueue.main.async { [weak self] in self?.configureMacWindowLater() }
            return
        }
        applyMacWindow(scene)
    }

    private var macWindowConfigured = false

    private func configureMacWindowLater() {
        guard !macWindowConfigured, let scene = window?.windowScene else { return }
        applyMacWindow(scene)
    }

    private func applyMacWindow(_ scene: UIWindowScene) {
        macWindowConfigured = true
        scene.title = "Pawlegends"
        scene.titlebar?.titleVisibility = .hidden
        scene.titlebar?.toolbar = nil
        let minimum = CGSize(width: 1280, height: 720)
        scene.sizeRestrictions?.minimumSize = minimum
        scene.sizeRestrictions?.maximumSize = CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        if #available(macCatalyst 16.0, *) {
            scene.sizeRestrictions?.allowsFullScreen = true
            // open at 1440×810 when the window is smaller (the first launch); after the window is on screen, since
            // a request made during launch is dropped. macOS keeps it on screen.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                let frame = scene.effectiveGeometry.systemFrame
                guard frame.width < 1440 else { return }
                let size = CGSize(width: 1440, height: 810)
                let origin = CGPoint(x: max(0, frame.midX - size.width / 2), y: max(0, frame.midY - size.height / 2))
                scene.requestGeometryUpdate(.Mac(systemFrame: CGRect(origin: origin, size: size)))
            }
        }
    }

    /// The menu bar: the app menu (About, Hide, Quit), Edit (copy and paste a party code), View (Enter Full Screen)
    /// and Window. No Format or Help menus: the game has no text formatting and no help book.
    override func buildMenu(with builder: UIMenuBuilder) {
        super.buildMenu(with: builder)
        guard builder.system == .main else { return }
        builder.remove(menu: .format)
        builder.remove(menu: .help)
        builder.remove(menu: .toolbar)
    }
    #endif

    /// Game audio (docs/plans/moba/APP-STORE.md "Native shell"): `.playback` with `.mixWithOthers`. The game's sound
    /// (announcer, hits, victory) plays with the silent switch on, like Wild Rift, and still mixes with the player's
    /// own music instead of stopping it. `.ambient` followed the switch and most phones live on silent, so players
    /// heard nothing (audio fix, Nov 9). The in-game Sound toggle is the way to silence the game. WebAudio plays
    /// through this session; no background audio mode is declared, so nothing plays once the app is backgrounded.
    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            NSLog("Pawlegends: audio session not set: \(error)")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // a call or the app switcher: the screen may sleep again; the game pauses itself on visibilitychange
        application.isIdleTimerDisabled = false
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // a match has no touches for long stretches (watching a lane): keep the screen on while the game is open
        application.isIdleTimerDisabled = true
        configureAudioSession()
        #if targetEnvironment(macCatalyst)
        configureMacWindowLater()
        #endif
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    /// Landscape only, for every window (Info.plist says the same; this also covers any presented controller).
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        return .landscape
    }
}
