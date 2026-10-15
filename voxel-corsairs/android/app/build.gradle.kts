plugins {
    id("com.android.application")
}

android {
    namespace = "com.sanj107.voxelcorsairs"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.sanj107.voxelcorsairs"
        minSdk = 24
        targetSdk = 34
        versionCode = 6
        versionName = "0.1.5"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so `assembleRelease` produces an installable APK.
            // Replace with your own signing config before publishing to a store.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}
