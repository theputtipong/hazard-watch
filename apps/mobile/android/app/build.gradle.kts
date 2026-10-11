import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Play upload key, kept outside git: HW_KEY_PROPERTIES or android/key.properties. Without it release builds
// fall back to the debug key so CI and contributors can still build (not uploadable to Play).
val keyPropertiesFile = (System.getenv("HW_KEY_PROPERTIES")?.takeIf { it.isNotBlank() }?.let(::File)
    ?: rootProject.file("key.properties")).takeIf { it.isFile }
val keyProperties = keyPropertiesFile?.let { f -> Properties().apply { f.inputStream().use(::load) } }

android {
    namespace = "com.pdouvch.hazardwatch"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "com.pdouvch.hazardwatch"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (keyProperties != null) {
            create("upload") {
                keyAlias = keyProperties.getProperty("keyAlias")
                keyPassword = keyProperties.getProperty("keyPassword")
                // A relative storeFile is resolved next to key.properties.
                storeFile = keyPropertiesFile!!.parentFile.resolve(keyProperties.getProperty("storeFile"))
                storePassword = keyProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName(if (keyProperties != null) "upload" else "debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
