import UIKit
import AVFoundation
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        // No storyboards: the window and the game screen are made here, the launch screen is the Info.plist
        // UILaunchScreen (background colour and paw from the asset catalog).
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(named: "LaunchBackground")
        window.rootViewController = GameViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    /// Game audio (docs/plans/moba/APP-STORE.md "Native shell"): `.ambient` mixes with the player's music and follows
    /// the silent switch, as players expect from a game; WebAudio plays through it.
    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
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
