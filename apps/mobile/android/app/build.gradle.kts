import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Play upload key, kept outside git: HW_KEY_PROPERTIES or android/key.properties. Without it a release APK
// falls back to the debug key so CI and contributors can still build one for testing, but a release AAB (the
// Play upload format), or any release build with -PrequireUploadKey, stops instead: Play rejects debug signing.
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

if (keyProperties == null) {
    gradle.taskGraph.whenReady {
        val guarded = setOf("bundleRelease") +
            (if (project.hasProperty("requireUploadKey")) setOf("assembleRelease") else emptySet())
        if (allTasks.any { it.project == project && it.name in guarded }) {
            throw GradleException(
                "No Play upload key: set HW_KEY_PROPERTIES or add android/key.properties (see apps/mobile/README.md). " +
                    "Play builds are never signed with the debug key."
            )
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
