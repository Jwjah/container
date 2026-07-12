package com.campusprint.app.data.repository

import com.campusprint.app.data.local.TokenManager
import com.campusprint.app.data.remote.api.*
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepository @Inject constructor(
    private val orderApi: OrderApi,
    private val tokenManager: TokenManager
) {
    private suspend fun getAuthHeader(): String {
        val token = tokenManager.tokenFlow.first() ?: ""
        return "Bearer $token"
    }

    suspend fun getOrders(): Result<List<OrderDto>> {
        return try {
            val response = orderApi.getOrders(getAuthHeader())
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "Failed to fetch orders"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateOrderStatus(orderId: Int, status: String): Result<UpdateStatusResponse> {
        return try {
            val response = orderApi.updateOrderStatus(
                getAuthHeader(),
                orderId,
                UpdateStatusRequest(status)
            )
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "Failed to update order status"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
