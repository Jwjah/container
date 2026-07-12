package com.campusprint.app.data.remote.api

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

data class LoginRequest(
    val email: String,
    val password: String
)

data class LoginResponse(
    val message: String,
    val token: String?,
    val requiresOTP: Boolean?,
    val email: String?,
    val user: UserDto?
)

data class RegisterRequest(
    val name: String,
    val email: String,
    val password: String,
    val role: String = "student"
)

data class RegisterResponse(
    val message: String,
    val userId: Int,
    val requiresOTP: Boolean
)

data class VerifyOtpRequest(
    val email: String,
    val code: String
)

data class VerifyOtpResponse(
    val message: String,
    val token: String,
    val user: UserDto
)

data class UserDto(
    val id: Int,
    val name: String,
    val email: String,
    val role: String
)

interface AuthApi {
    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<RegisterResponse>

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @POST("auth/verify-otp")
    suspend fun verifyOtp(@Body request: VerifyOtpRequest): Response<VerifyOtpResponse>
}
