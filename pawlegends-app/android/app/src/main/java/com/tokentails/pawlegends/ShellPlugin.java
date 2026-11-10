package com.tokentails.pawlegends;

import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.Locale;

/**
 * The page-facing half of the Android shell (no JS API: it only sets globals, like GameViewController.swift does on iOS).
 * A plugin because Capacitor loads plugins before the WebView loads the game, so the document-start script is in place
 * for the very first page and for every Capgo bundle swap after it.
 *
 * - `window.__PL_CHANNEL__`: the OTA channel (src/shell/manifest.ts). `dev` for debug builds (a local update server,
 *   scripts/ota-local.mjs), else BuildConfig.PL_OTA_CHANNEL: `stable` unless the build passed -PplOtaChannel=beta.
 *   Google Play cannot tell an internal-testing install from production (the same AAB is promoted), so a Play build
 *   reads stable.
 * - `window.__PL_PLATFORM__ = 'android'`.
 * - `window.__PL_THERMAL__ = { state, lowPower }` and a `pl-thermal` event on changes (pawlegends/src/render/perf/
 *   thermal.ts and governor.ts): PowerManager's thermal status (Android 10+) mapped to the iOS names, and battery saver.
 * - `window.__PL_DEVICE__ = { ramMb, lowRam, perfClass }`: memory class for the game's starting quality tier.
 * The renderer recovery (a renderer killed for memory restarts the activity) lives in MainActivity: Capacitor's
 * Bridge.Builder replaces the bridge's listener list after plugins load, so a listener added in load() is dropped.
 */
@CapacitorPlugin(name = "PawlegendsShell")
public class ShellPlugin extends Plugin {

    private static final String TAG = "PawlegendsShell";
    private static final String ORIGIN = "https://localhost";

    private ScriptHandler startScript;
    private PowerManager power;
    private PowerManager.OnThermalStatusChangedListener thermalListener;
    private BroadcastReceiver saverReceiver;

    @Override
    public void load() {
        power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        installStartScript();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && power != null) {
            thermalListener = status -> thermalChanged();
            power.addThermalStatusListener(ContextCompat.getMainExecutor(getContext()), thermalListener);
        }
        saverReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                thermalChanged();
            }
        };
        ContextCompat.registerReceiver(
            getContext(),
            saverReceiver,
            new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    /** The OTA channel this binary reads. */
    static String channel() {
        return BuildConfig.DEBUG ? "dev" : BuildConfig.PL_OTA_CHANNEL;
    }

    /** PowerManager.THERMAL_STATUS_* as the iOS names thermal.ts knows (nominal, fair, serious, critical). */
    static String thermalName(int status) {
        switch (status) {
            case 0: // THERMAL_STATUS_NONE
                return "nominal";
            case 1: // LIGHT
                return "fair";
            case 2: // MODERATE
                return "serious";
            default: // SEVERE, CRITICAL, EMERGENCY, SHUTDOWN
                return "critical";
        }
    }

    private String thermalLiteral() {
        String state = "nominal";
        boolean lowPower = false;
        if (power != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) state = thermalName(power.getCurrentThermalStatus());
            lowPower = power.isPowerSaveMode();
        }
        return "{ state: '" + state + "', lowPower: " + lowPower + " }";
    }

    private String deviceLiteral() {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        long ramMb = 0;
        boolean lowRam = false;
        if (am != null) {
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            ramMb = mi.totalMem / (1024 * 1024);
            lowRam = am.isLowRamDevice();
        }
        int perfClass = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? Build.VERSION.MEDIA_PERFORMANCE_CLASS : 0;
        return String.format(Locale.ROOT, "{ ramMb: %d, lowRam: %b, perfClass: %d }", ramMb, lowRam, perfClass);
    }

    private String startSource() {
        return (
            "window.__PL_CHANNEL__ = '" +
            channel() +
            "'; window.__PL_PLATFORM__ = 'android'; window.__PL_THERMAL__ = " +
            thermalLiteral() +
            "; window.__PL_DEVICE__ = " +
            deviceLiteral() +
            ";"
        );
    }

    /** (Re)install the document-start script, so a later reload (a bundle swap) also starts with the current state. */
    private void installStartScript() {
        WebView web = bridge.getWebView();
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            // below Chromium ~90 (minWebViewVersion 110 shows Capacitor's update page first): the shell falls back
            // to stable and Capacitor.getPlatform()
            Log.w(TAG, "no document-start scripts in this WebView");
            return;
        }
        if (startScript != null) startScript.remove();
        startScript = WebViewCompat.addDocumentStartJavaScript(web, startSource(), Collections.singleton(ORIGIN));
    }

    /** Thermal or battery-saver state changed: tell the running page and refresh the start script. */
    private void thermalChanged() {
        if (bridge == null) return;
        bridge.executeOnMainThread(() -> {
            installStartScript();
            String js = "window.__PL_THERMAL__ = " + thermalLiteral() + "; window.dispatchEvent(new Event('pl-thermal'));";
            bridge.getWebView().evaluateJavascript(js, null);
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && power != null && thermalListener != null) {
            power.removeThermalStatusListener(thermalListener);
        }
        if (saverReceiver != null) {
            try {
                getContext().unregisterReceiver(saverReceiver);
            } catch (IllegalArgumentException ignored) {}
        }
        super.handleOnDestroy();
    }
}
