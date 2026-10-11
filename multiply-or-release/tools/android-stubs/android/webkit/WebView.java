package android.webkit;

import android.content.Context;
import android.view.View;

public class WebView extends View {
    public WebView(Context context) { }
    public WebSettings getSettings() { return null; }
    public void setWebChromeClient(WebChromeClient client) { }
    public void setWebViewClient(WebViewClient client) { }
    public void loadUrl(String url) { }
    public void evaluateJavascript(String script, ValueCallback<String> resultCallback) { }
    public void onPause() { }
    public void onResume() { }
    public void destroy() { }
}
