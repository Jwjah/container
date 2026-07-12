package com.campusprint.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class CampusPrintApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialization logic here
    }
}
