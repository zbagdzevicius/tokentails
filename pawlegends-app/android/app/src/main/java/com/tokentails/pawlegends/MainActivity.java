package com.tokentails.pawlegends;

import android.graphics.Rect;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Arrays;

/**
 * The Pawlegends game window on Android: the Android half of ios/App/App/GameViewController.swift and AppDelegate.swift
 * (docs/plans/moba/PLAY-STORE.md "iOS parity"). Landscape comes from AndroidManifest.xml (sensorLandscape, game
 * category); the document-start globals, thermal state and renderer recovery live in ShellPlugin.
 *
 * - full screen: the status and navigation bars are hidden (immersive; a swipe shows them for a moment), re-applied
 *   whenever the window regains focus;
 * - display cutout: the window draws into it, and the WebView's parent is padded by the cutout (the Android WebView
 *   does not reliably report env(safe-area-inset-*)), so the HUD never sits under a punch hole; the padding shows the
 *   game's background colour;
 * - the WebView: no zoom, text at 100% whatever the system font size (the HUD is laid out in px), no overscroll glow,
 *   no scrollbars, no long-press menu or long-press haptic;
 * - back-gesture exclusion at the lower side edges, where the thumbs rest on the joystick and the ability buttons;
 *   the back button itself is handled by the page (src/shell/back.ts);
 * - the screen stays on while the game is in front (FLAG_KEEP_SCREEN_ON applies only while the window is visible);
 * - the volume keys change the media volume (the game's sound), not the ringer. WebAudio plays on the media stream,
 *   so sound plays with the ringer silenced and mixes with the player's music, as on iPhone.
 */
public class MainActivity extends BridgeActivity {

    /** Android caps gesture exclusion at 200 dp per side edge. */
    private static final int EXCLUDE_DP = 200;
    private static final int EXCLUDE_WIDTH_DP = 48;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShellPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        int bg = getResources().getColor(R.color.pl_bg, getTheme());
        getWindow().getDecorView().setBackgroundColor(bg);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemBars();

        WebView web = bridge != null ? bridge.getWebView() : null;
        if (web == null) return;
        setUpWebView(web, bg);
        if (web.getParent() instanceof ViewGroup) {
            ViewGroup parent = (ViewGroup) web.getParent();
            parent.setBackgroundColor(bg);
            ViewCompat.setOnApplyWindowInsetsListener(parent, (v, insets) -> {
                Insets cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
                v.setPadding(cut.left, cut.top, cut.right, cut.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(parent);
        }
    }

    private void setUpWebView(WebView web, int bg) {
        WebSettings s = web.getSettings();
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        web.setBackgroundColor(bg);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true);
        web.setHapticFeedbackEnabled(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            float dp = getResources().getDisplayMetrics().density;
            int tall = Math.round(EXCLUDE_DP * dp);
            int wide = Math.round(EXCLUDE_WIDTH_DP * dp);
            web.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
                int w = r - l;
                int h = b - t;
                v.setSystemGestureExclusionRects(
                    Arrays.asList(new Rect(0, Math.max(0, h - tall), wide, h), new Rect(Math.max(0, w - wide), Math.max(0, h - tall), w, h))
                );
            });
        }
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemBars();
    }
}
