package com.campusprint.app.data.repository

import com.campusprint.app.data.local.TokenManager
import com.campusprint.app.data.remote.api.*
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val authApi: AuthApi,
    private val tokenManager: TokenManager
) {
    val jwtToken: Flow<String?> = tokenManager.tokenFlow
    val userRole: Flow<String?> = tokenManager.roleFlow

    suspend fun login(email: String, password: String): Result<LoginResponse> {
        return try {
            val response = authApi.login(LoginRequest(email, password))
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                // If it succeeded and didn't require OTP, save the token immediately
                if (body.token != null && body.user != null) {
                    tokenManager.saveToken(body.token, body.user.role)
                }
                Result.success(body)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "Login failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun register(name: String, email: String, password: String, role: String): Result<RegisterResponse> {
        return try {
            val response = authApi.register(RegisterRequest(name, email, password, role))
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "Registration failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun verifyOtp(email: String, code: String): Result<VerifyOtpResponse> {
        return try {
            val response = authApi.verifyOtp(VerifyOtpRequest(email, code))
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                tokenManager.saveToken(body.token, body.user.role)
                Result.success(body)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "Verification failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun logout() {
        tokenManager.clearAuth()
    }
}
