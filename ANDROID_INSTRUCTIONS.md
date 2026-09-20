# Native Android Packaging and Deployment Instructions

This document provides complete instructions for bundling the **INAI Vision Board** into a native Android application using Capacitor.

---

## 1. Prerequisites

- **Node.js**: v18+ or v20+
- **Android Studio**: Ladybug / Hedgehog or newer with Android SDK Platform 34+
- **Java Development Kit (JDK)**: JDK 17 or JDK 21

---

## 2. Android Manifest Permissions

When the Android project is initialized, ensure the following permissions are present inside `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.inai.vision">

    <!-- Camera & Visual Input Permissions -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="true" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <!-- Audio & Microphone Permissions -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-feature android:name="android.hardware.microphone" android:required="true" />

    <!-- Network Access for Gemini API & Cloud Services -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Haptic & Vibration Feedback -->
    <uses-permission android:name="android.permission.VIBRATE" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>
    </application>
</manifest>
```

---

## 3. Step-by-Step Android Build Commands

### Step A: Install Capacitor Packages
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
```

### Step B: Build Web Production Assets
```bash
npm run build
```

### Step C: Initialize the Android Native Project
```bash
npx cap add android
```

### Step D: Synchronize Web Code and Configuration
```bash
npx cap sync
```

### Step E: Open in Android Studio or Build APK
To open the project in Android Studio:
```bash
npx cap open android
```

To build a debug APK directly via command line:
```bash
cd android
./gradlew assembleDebug
```
The compiled APK will be located at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 4. Hardware and Runtime Platform Fallbacks

The web application automatically falls back between native and browser capabilities:
- **Camera**: Native `getUserMedia` / WebRTC stream on Android WebView with hardware acceleration.
- **Audio / Speech**: Uses Android's `SpeechRecognizer` service via Chromium WebView, with graceful fallbacks.
- **On-Device AI Models**: TensorFlow.js and Face Embedding extraction run on-device utilizing WebGL/WebGPU acceleration inside the native Android WebView.
