package com.campusprint.app.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.campusprint.app.data.remote.api.OrderDto
import com.campusprint.app.data.repository.AuthRepository
import com.campusprint.app.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface DashboardUiState {
    object Loading : DashboardUiState
    data class Success(val orders: List<OrderDto>, val role: String) : DashboardUiState
    data class Error(val error: String) : DashboardUiState
}

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<DashboardUiState>(DashboardUiState.Loading)
    val uiState: StateFlow<DashboardUiState> = _uiState

    init {
        loadDashboard()
    }

    fun loadDashboard() {
        viewModelScope.launch {
            _uiState.value = DashboardUiState.Loading
            // First determine user role from flow
            authRepository.userRole.collectLatest { role ->
                if (role != null) {
                    orderRepository.getOrders()
                        .onSuccess { orders ->
                            _uiState.value = DashboardUiState.Success(orders, role)
                        }
                        .onFailure { error ->
                            _uiState.value = DashboardUiState.Error(error.message ?: "Failed to load orders")
                        }
                } else {
                    _uiState.value = DashboardUiState.Error("Session expired")
                }
            }
        }
    }

    fun updateOrderStatus(orderId: Int, status: String) {
        viewModelScope.launch {
            orderRepository.updateOrderStatus(orderId, status)
                .onSuccess {
                    loadDashboard()
                }
                .onFailure { error ->
                    _uiState.value = DashboardUiState.Error(error.message ?: "Failed to update order status")
                }
        }
    }

    fun logout(onComplete: () -> Unit) {
        viewModelScope.launch {
            authRepository.logout()
            onComplete()
        }
    }
}
