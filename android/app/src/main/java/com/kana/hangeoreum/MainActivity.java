package com.kana.hangeoreum;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    public WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackup;
    private static final int IMPORT_FILE = 10, EXPORT_FILE = 11;
    private static final String ORIGIN = "appassets.androidplatform.net";
    private static final int LIGHT_BACKGROUND = Color.rgb(245, 244, 239), DARK_BACKGROUND = Color.rgb(19, 24, 25);

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        // 페이지가 테마를 알려 주기 전에는 시스템 다크 모드에 맞춰 화면과 시스템 줄 색을 정해요.
        applySystemBars(isSystemDark());
        // Android 15/16의 화면 가장자리 영역을 피하고 키보드가 뜨면 공간을 확보해요.
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return insets;
            });
        }
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // 사용자가 선택한 기록 파일만 읽기
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (ORIGIN.equals(request.getUrl().getHost())) return assets.shouldInterceptRequest(request.getUrl());
                // 앱은 외부 페이지나 스크립트를 불러오지 않습니다.
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (ORIGIN.equals(request.getUrl().getHost()) && request.getUrl().getPath().startsWith("/assets/www/")) return false;
                if (request.hasGesture() && ("https".equals(request.getUrl().getScheme()) || "http".equals(request.getUrl().getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) { }
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if(BuildConfig.DEBUG && message.messageLevel()==ConsoleMessage.MessageLevel.ERROR) android.util.Log.e("KanaWebView",message.message()+" at "+message.lineNumber());return true;
            }
            @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인", (d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show(); return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인", (d,w)->result.confirm()).setNegativeButton("취소", (d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show(); return true;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                try { startActivityForResult(intent, IMPORT_FILE); } catch (Exception e) { callback.onReceiveValue(null);fileCallback=null; }
                return true;
            }
        });
        webView.addJavascriptInterface(new BackupBridge(), "KanaAndroid");
        webView.loadUrl("https://" + ORIGIN + "/assets/www/index.html");
        if (android.os.Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
    }

    private class BackupBridge {
        @JavascriptInterface public void exportBackup(String json, String filename) {
            if (json == null || json.length() > 2_000_000) return;
            runOnUiThread(() -> {
                pendingBackup = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, filename.replaceAll("[/\\\\]", "_"));
                try { startActivityForResult(intent, EXPORT_FILE); } catch (Exception e) { pendingBackup=null;Toast.makeText(MainActivity.this,"기록 저장 창을 열지 못했어요.",Toast.LENGTH_LONG).show(); }
            });
        }
        @JavascriptInterface public boolean isSystemDark() { return MainActivity.this.isSystemDark(); }
        @JavascriptInterface public void setDarkTheme(boolean dark) { runOnUiThread(() -> applySystemBars(dark)); }
    }
    private boolean isSystemDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }
    /** 웹 화면 테마에 맞춰 WebView 배경(시스템 줄 뒤 여백)과 상태 표시줄·내비게이션 줄 색을 맞춰요. */
    @SuppressWarnings("deprecation")
    private void applySystemBars(boolean dark) {
        int background = dark ? DARK_BACKGROUND : LIGHT_BACKGROUND;
        webView.setBackgroundColor(background);
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            int light = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(dark ? 0 : light, light);
        } else {
            View decor = getWindow().getDecorView();
            int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            decor.setSystemUiVisibility(dark ? decor.getSystemUiVisibility() & ~flags : decor.getSystemUiVisibility() | flags);
        }
    }
    @Override public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // 앱을 켠 채 시스템 다크 모드가 바뀌면 '자동' 테마를 다시 맞춰요.
        if (webView != null) webView.evaluateJavascript("if(typeof onSystemThemeChanged==='function')onSystemThemeChanged();", null);
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == IMPORT_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(resultCode == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null);fileCallback=null;
        }
        if (requestCode == EXPORT_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingBackup != null) {
                try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
                    stream.write(pendingBackup.getBytes(StandardCharsets.UTF_8));Toast.makeText(this,"학습 기록을 저장했어요.",Toast.LENGTH_SHORT).show();
                    webView.evaluateJavascript("if(typeof backupSaved==='function')backupSaved();", null);
                } catch (Exception e) { Toast.makeText(this,"기록을 저장하지 못했어요.",Toast.LENGTH_LONG).show(); }
            }
            pendingBackup=null;
        }
    }
    private void handleBack() {
        webView.evaluateJavascript("typeof handleAndroidBack==='function'?handleAndroidBack():'exit'", result -> {
            if ("\"exit\"".equals(result)) finish();
        });
    }
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onPause() { webView.evaluateJavascript("if(typeof stopAudio==='function')stopAudio();if(typeof stopTimer==='function')stopTimer();",null);webView.onPause();super.onPause(); }
    @Override protected void onResume() { super.onResume();if(webView!=null){webView.onResume();webView.evaluateJavascript("if(typeof state!=='undefined'&&state.mode==='quiz'&&state.quiz&&!state.quiz.answered)startTimer();",null);} }
    @Override protected void onDestroy() { if(fileCallback!=null)fileCallback.onReceiveValue(null);webView.removeJavascriptInterface("KanaAndroid");webView.destroy();super.onDestroy(); }
}
