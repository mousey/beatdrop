plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.beatdrop.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.beatdrop.tv"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

// Automatically bundle web assets (/public) before compiling APK (no gameset_database.json shipped in APK!)
val syncWebAssets by tasks.registering {
    doLast {
        val publicDest = file("src/main/assets/public")
        publicDest.mkdirs()

        // Copy /public web files into APK assets/public (excluding .apk files)
        copy {
            from(rootProject.file("../public"))
            exclude("*.apk")
            into(publicDest)
        }
    }
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}
