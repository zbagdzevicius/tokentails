package com.tokentails.pawlegends;

import android.annotation.SuppressLint;
import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.util.Collections;
import java.util.Locale;
import java.util.regex.Pattern;

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
 * - `window.__PL_NATIVE_AUTH__ = { apple, google, configured }`: the sign-in providers this build can use (NativeAuth).
 * The renderer recovery (a renderer killed for memory restarts the activity) lives in MainActivity: Capacitor's
 * Bridge.Builder replaces the bridge's listener list after plugins load, so a listener added in load() is dropped.
 *
 * One JS method, `saveFile({ name, mime, data })` (pawlegends/src/share/saveFile.ts): the WebView ignores
 * `<a download>`, so a clip video or the Legend Moment picture is written here into the gallery (MediaStore, Android 10+,
 * no permission): videos to Movies/Paw Legends, pictures to Pictures/Paw Legends. Resolves `{ folder }`.
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

    /** File names the game sends: paw-legends-clip-20261118.mp4, paw-legends-moment.png. */
    private static final Pattern SAVE_NAME = Pattern.compile("^paw-legends-[a-z0-9-]{1,48}\\.(mp4|webm|png)$");
    /** 60 MB of video at most (a 20 s clip is about 10 MB). */
    private static final int SAVE_MAX_BYTES = 60 * 1024 * 1024;

    // MediaStore's RELATIVE_PATH / IS_PENDING / VOLUME_EXTERNAL_PRIMARY are Android 10+: guarded by the SDK_INT check below
    @SuppressLint("NewApi")
    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "");
        String mime = call.getString("mime", "");
        String data = call.getString("data", "");
        if (name == null || !SAVE_NAME.matcher(name).matches() || mime == null || !(mime.startsWith("video/") || mime.equals("image/png")) || data == null || data.isEmpty()) {
            call.reject("bad file", "INVALID");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Android 8 and 9 need a storage permission for the gallery: the game falls back to its own message
            call.reject("saving needs Android 10", "UNSUPPORTED");
            return;
        }
        final boolean video = mime.startsWith("video/");
        getBridge().execute(() -> {
            Uri item = null;
            ContentResolver resolver = getContext().getContentResolver();
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                if (bytes.length == 0 || bytes.length > SAVE_MAX_BYTES) {
                    call.reject("bad size", "INVALID");
                    return;
                }
                String folder = (video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES) + "/Paw Legends";
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, folder);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri collection = video
                    ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                item = resolver.insert(collection, values);
                if (item == null) throw new IllegalStateException("no gallery entry");
                try (OutputStream out = resolver.openOutputStream(item)) {
                    if (out == null) throw new IllegalStateException("no stream");
                    out.write(bytes);
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(item, done, null, null);
                JSObject ret = new JSObject();
                ret.put("folder", folder);
                call.resolve(ret);
            } catch (Exception e) {
                Log.w(TAG, "saveFile failed", e);
                if (item != null) {
                    try {
                        resolver.delete(item, null, null);
                    } catch (Exception ignored) {}
                }
                call.reject("could not save", "FAILED");
            }
        });
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
            "; window.__PL_NATIVE_AUTH__ = " +
            NativeAuth.literal() +
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
