plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI passes the release's version (-PappVersion=2026.10.4); versionCode grows with it, which Android needs to accept an update
val appVersion = (findProperty("appVersion") as String?) ?: "0.1.0"
val parts = appVersion.split(".").map { it.toIntOrNull() ?: 0 }
val code = parts.getOrElse(0) { 0 } * 10000 + parts.getOrElse(1) { 0 } * 100 + parts.getOrElse(2) { 0 }

android {
    namespace = "app.turbokeep.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.turbokeep.android"
        minSdk = 29
        targetSdk = 35
        versionCode = code
        versionName = appVersion
        buildConfigField("String", "REPO_OWNER", "\"TurboNZL\"")
        buildConfigField("String", "REPO_NAME", "\"turbokeep\"")
    }
    buildFeatures { buildConfig = true }

    // One fixed key for every build: Android only installs an update over an app signed with the same key.
    // The app is for personal use, so the key lives in the repository (the engine's android-shell does the same).
    signingConfigs {
        create("keep") {
            storeFile = file("../turbokeep.keystore")
            storePassword = "turbokeep-personal"
            keyAlias = "turbokeep"
            keyPassword = "turbokeep-personal"
        }
    }
    buildTypes {
        release { signingConfig = signingConfigs.getByName("keep"); isMinifyEnabled = false }
        debug { signingConfig = signingConfigs.getByName("keep"); applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/web"))
}

// The web client (apps/web) is bundled into the app and shown in a WebView from http://localhost, like TurboMusic's: build it first with `pnpm --filter @turbokeep/web build`.
val copyWeb by tasks.registering(Copy::class) {
    val dist = file("../../web/dist")
    from(dist)
    into(layout.buildDirectory.dir("generated/web"))
    doFirst { check(dist.resolve("index.html").exists()) { "Build the web client first: pnpm --filter @turbokeep/web build" } }
}
tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
