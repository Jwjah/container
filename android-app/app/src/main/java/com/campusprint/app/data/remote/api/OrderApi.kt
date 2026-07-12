package com.campusprint.app.data.remote.api

import retrofit2.Response
import retrofit2.http.*

data class OrderDto(
    val id: Int,
    val order_hash: String,
    val status: String, // Pending, Printed, Collected, etc.
    val print_type: String,
    val copies: Int,
    val total_price: Double,
    val created_at: String,
    val files: List<OrderFileDto>
)

data class OrderFileDto(
    val id: Int,
    val original_name: String,
    val file_path: String,
    val page_count: Int
)

data class UpdateStatusRequest(
    val status: String
)

data class UpdateStatusResponse(
    val message: String
)

interface OrderApi {
    @GET("orders")
    suspend fun getOrders(
        @Header("Authorization") token: String
    ): Response<List<OrderDto>>

    @PATCH("orders/{id}/status")
    suspend fun updateOrderStatus(
        @Header("Authorization") token: String,
        @Path("id") orderId: Int,
        @Body request: UpdateStatusRequest
    ): Response<UpdateStatusResponse>
}
