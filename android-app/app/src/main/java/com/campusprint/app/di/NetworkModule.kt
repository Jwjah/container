package com.campusprint.app.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        return OkHttpClient.Builder()
            .addInterceptor(logging)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit {
        return Retrofit.Builder()
            .baseUrl("http://10.0.2.2:5000/api/") // Use 10.0.2.2 for Android Emulator connecting to localhost
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    @Provides
    @Singleton
    fun provideAuthApi(retrofit: Retrofit): com.campusprint.app.data.remote.api.AuthApi {
        return retrofit.create(com.campusprint.app.data.remote.api.AuthApi::class.java)
    }

    @Provides
    @Singleton
    fun provideOrderApi(retrofit: Retrofit): com.campusprint.app.data.remote.api.OrderApi {
        return retrofit.create(com.campusprint.app.data.remote.api.OrderApi::class.java)
    }
}
