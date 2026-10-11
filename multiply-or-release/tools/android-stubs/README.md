Compile-only stand-ins for the handful of Android framework classes that
`MainActivity` touches. `tools/build_apk.sh` compiles against them when no
Android SDK is installed; they are never packaged into the APK, the real
framework classes on the device are used at runtime. Method signatures and the
inlined constant values match the Android SDK.
