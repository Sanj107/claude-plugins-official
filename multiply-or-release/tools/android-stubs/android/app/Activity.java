package android.app;

import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.view.Window;

public class Activity extends Context {
    protected void onCreate(Bundle savedInstanceState) { }
    protected void onResume() { }
    protected void onPause() { }
    protected void onDestroy() { }
    public void onBackPressed() { }
    public void onWindowFocusChanged(boolean hasFocus) { }
    public Window getWindow() { return null; }
    public void setContentView(View view) { }
    public void finish() { }
}
