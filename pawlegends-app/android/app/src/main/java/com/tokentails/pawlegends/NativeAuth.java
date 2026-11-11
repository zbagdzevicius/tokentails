package com.tokentails.pawlegends;

import android.content.Context;
import android.util.Log;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

/**
 * Native sign-in setup (sign-in; the Android half of ios/App/App/NativeAuth.swift). The Capacitor Firebase
 * Authentication plugin calls FirebaseAuth.getInstance() when it loads, which throws without a FirebaseApp. With
 * google-services.json the FirebaseInitProvider has made one before the activity starts; without it (a dev build)
 * a placeholder app is made here, so the plugin loads and the game plays with Google sign-in off. The page learns
 * what works from window.__PL_NATIVE_AUTH__ (ShellPlugin). Apple is never offered on Android (src/host/auth.ts).
 */
final class NativeAuth {

    private static boolean configured = false;

    private NativeAuth() {}

    static void setUp(Context context) {
        try {
            if (!FirebaseApp.getApps(context).isEmpty()) {
                configured = true;
                return;
            }
            FirebaseOptions options = new FirebaseOptions.Builder()
                .setApplicationId("1:000000000000:android:0000000000000000")
                .setApiKey("unconfigured")
                .setProjectId("pawlegends-unconfigured")
                .build();
            FirebaseApp.initializeApp(context, options);
            Log.w("PawlegendsShell", "no google-services.json: Google sign-in is off in this build");
        } catch (Exception e) {
            Log.w("PawlegendsShell", "Firebase setup failed: sign-in off", e);
        }
    }

    /** The JS literal for window.__PL_NATIVE_AUTH__. */
    static String literal() {
        return "{ apple: false, google: " + configured + ", configured: " + configured + " }";
    }
}
