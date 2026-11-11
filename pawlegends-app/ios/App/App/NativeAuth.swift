import Foundation
import FirebaseCore

/// Native sign-in setup (sign-in, docs/plans/moba/APP-STORE.md "Sign-in"). The Capacitor Firebase Authentication
/// plugin calls `FirebaseApp.configure()` when it loads, which crashes at launch without `GoogleService-Info.plist`.
/// So Firebase is configured here first: from the plist when the build has one (the founder adds it, see
/// pawlegends-app/README.md "Sign-in setup"), else with placeholder options, so the plugin loads and the game plays.
/// The page learns what works from `window.__PL_NATIVE_AUTH__` (GameViewController's document-start script):
///
/// - `apple`: Sign in with Apple needs no Firebase native config (the Firebase JS SDK signs in with its token), only
///   the entitlement: always on.
/// - `google`: GoogleSignIn needs the real plist (its client id) and its REVERSED_CLIENT_ID URL scheme in Info.plist
///   (scripts/firebase-config.mjs adds it); without them a Google tap is an Objective-C exception, so it stays off.
///
/// Release builds never reach the placeholder: scripts/check-firebase-config.mjs fails them first.
enum NativeAuth {
    private(set) static var configured = false
    private(set) static var googleReady = false

    static func setUp(bundle: Bundle = .main) {
        guard FirebaseApp.app() == nil else {
            configured = true
            return
        }
        if let path = bundle.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: path),
           !options.googleAppID.isEmpty {
            FirebaseApp.configure(options: options)
            configured = true
            googleReady = hasURLScheme(reversedClientId: reversed(options.clientID), bundle: bundle)
            if !googleReady {
                NSLog("[NativeAuth] Google sign-in off: REVERSED_CLIENT_ID is not a URL scheme in Info.plist (run npm run build)")
            }
            return
        }
        // no plist (a dev or simulator build): a placeholder app, so the plugin loads; Google stays off
        let options = FirebaseOptions(googleAppID: "1:000000000000:ios:0000000000000000", gcmSenderID: "000000000000")
        options.apiKey = "unconfigured"
        options.projectID = "pawlegends-unconfigured"
        FirebaseApp.configure(options: options)
        NSLog("[NativeAuth] no GoogleService-Info.plist: Google sign-in is off in this build (Apple and email still work)")
    }

    /// The JS literal for `window.__PL_NATIVE_AUTH__`.
    static var literal: String {
        "{ apple: true, google: \(googleReady ? "true" : "false"), configured: \(configured ? "true" : "false") }"
    }

    /// `com.googleusercontent.apps.<id>` from the client id `<id>.apps.googleusercontent.com`.
    static func reversed(_ clientID: String?) -> String? {
        guard let clientID, !clientID.isEmpty else { return nil }
        return clientID.split(separator: ".").reversed().joined(separator: ".")
    }

    static func hasURLScheme(reversedClientId: String?, bundle: Bundle) -> Bool {
        guard let wanted = reversedClientId?.lowercased(),
              let types = bundle.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] else { return false }
        return types.contains { ($0["CFBundleURLSchemes"] as? [String])?.contains { $0.lowercased() == wanted } ?? false }
    }
}
